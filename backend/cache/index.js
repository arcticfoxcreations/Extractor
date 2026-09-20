'use strict';

const config = require('../config');
const logger = require('../utils/logger');
const MemoryStore = require('./memoryStore');
const RedisStore = require('./redisStore');

const stats = {
  hits: 0,
  misses: 0,
  staleHits: 0,
  writes: 0,
  errors: 0,
  startedAt: Date.now()
};

let store = new MemoryStore({ maxEntries: config.cache.maxEntries });
let redisStore = null;
const inFlight = new Map();

async function init() {
  if (config.cache.driver !== 'redis' || !config.cache.redisUrl) {
    logger.info('cache driver: memory', { maxEntries: config.cache.maxEntries });
    return;
  }

  redisStore = new RedisStore({
    url: config.cache.redisUrl,
    staleSeconds: config.cache.staleSeconds
  });

  const connected = await redisStore.connect();
  if (connected) {
    store = redisStore;
  } else {
    redisStore = null;
  }
}

function now() {
  return Date.now();
}

function ageSeconds(entry) {
  return Math.round((now() - entry.storedAt) / 1000);
}

/**
 * Returns cached data when fresh, returns stale data immediately while
 * refreshing in the background, and otherwise computes the value.
 * `producer` must resolve to the value to store.
 */
async function wrap(key, producer, { ttlSeconds = config.cache.ttlSeconds } = {}) {
  let entry = null;

  try {
    entry = await store.get(key);
  } catch (error) {
    stats.errors += 1;
    logger.warn('cache read failed', { key, reason: error.message });
  }

  if (entry) {
    const age = ageSeconds(entry);

    if (age <= ttlSeconds) {
      stats.hits += 1;
      return { value: entry.value, cache: { status: 'hit', ageSeconds: age } };
    }

    if (age <= config.cache.staleSeconds) {
      stats.staleHits += 1;
      revalidate(key, producer);
      return { value: entry.value, cache: { status: 'stale', ageSeconds: age } };
    }
  }

  stats.misses += 1;
  const value = await dedupe(key, producer);
  await put(key, value);
  return { value, cache: { status: 'miss', ageSeconds: 0 } };
}

// Collapses a burst of identical requests into a single upstream call.
function dedupe(key, producer) {
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = Promise.resolve()
    .then(producer)
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

function revalidate(key, producer) {
  if (inFlight.has(key)) return;
  dedupe(key, producer)
    .then((value) => put(key, value))
    .catch((error) => {
      logger.warn('background refresh failed', { key, reason: error.message });
    });
}

async function put(key, value) {
  try {
    await store.set(key, { value, storedAt: now() });
    stats.writes += 1;
  } catch (error) {
    stats.errors += 1;
    logger.warn('cache write failed', { key, reason: error.message });
  }
}

async function get(key) {
  const entry = await store.get(key);
  return entry ? entry.value : null;
}

async function clear() {
  return store.clear();
}

async function snapshot() {
  const total = stats.hits + stats.staleHits + stats.misses;
  const entries = await store.size();

  return {
    driver: store.name,
    healthy: await store.ready(),
    entries,
    maxEntries: store.name === 'memory' ? config.cache.maxEntries : null,
    ttlSeconds: config.cache.ttlSeconds,
    staleSeconds: config.cache.staleSeconds,
    hits: stats.hits,
    staleHits: stats.staleHits,
    misses: stats.misses,
    writes: stats.writes,
    errors: stats.errors,
    hitRate: total === 0 ? 0 : Number(((stats.hits + stats.staleHits) / total).toFixed(3)),
    inFlight: inFlight.size,
    uptimeSeconds: Math.round((now() - stats.startedAt) / 1000),
    recentKeys: await store.keys(15)
  };
}

async function shutdown() {
  if (redisStore) {
    await redisStore.disconnect();
  }
}

module.exports = { init, wrap, get, clear, snapshot, shutdown };
