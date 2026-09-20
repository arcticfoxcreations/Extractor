'use strict';

const logger = require('../utils/logger');

const KEY_PREFIX = 'wx:';

/**
 * Thin wrapper over node-redis. The client is an optional dependency, so a
 * deployment without Redis installed simply falls back to the memory store
 * instead of crashing at boot.
 */
class RedisStore {
  constructor({ url, staleSeconds }) {
    this.name = 'redis';
    this.url = url;
    this.staleSeconds = staleSeconds;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    let createClient;
    try {
      ({ createClient } = require('redis'));
    } catch (error) {
      logger.warn('redis package not installed, falling back to memory cache');
      return false;
    }

    this.client = createClient({ url: this.url });
    this.client.on('error', (error) => {
      this.connected = false;
      logger.error('redis connection error', { reason: error.message });
    });
    this.client.on('ready', () => {
      this.connected = true;
    });

    try {
      await this.client.connect();
      this.connected = true;
      logger.info('redis cache connected');
      return true;
    } catch (error) {
      logger.warn('redis unreachable, falling back to memory cache', { reason: error.message });
      this.client = null;
      return false;
    }
  }

  async get(key) {
    if (!this.connected) return null;
    try {
      const raw = await this.client.get(KEY_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      logger.warn('redis read failed', { reason: error.message });
      return null;
    }
  }

  async set(key, entry) {
    if (!this.connected) return;
    try {
      // Redis expiry is set past the stale window; freshness is decided by the
      // timestamp stored inside the entry, not by Redis itself.
      await this.client.set(KEY_PREFIX + key, JSON.stringify(entry), {
        EX: this.staleSeconds
      });
    } catch (error) {
      logger.warn('redis write failed', { reason: error.message });
    }
  }

  async delete(key) {
    if (!this.connected) return false;
    const removed = await this.client.del(KEY_PREFIX + key);
    return removed > 0;
  }

  async clear() {
    if (!this.connected) return 0;
    const keys = await this.client.keys(`${KEY_PREFIX}*`);
    if (keys.length === 0) return 0;
    await this.client.del(keys);
    return keys.length;
  }

  async size() {
    if (!this.connected) return 0;
    const keys = await this.client.keys(`${KEY_PREFIX}*`);
    return keys.length;
  }

  async keys(limit) {
    if (!this.connected) return [];
    const keys = await this.client.keys(`${KEY_PREFIX}*`);
    return keys.slice(0, limit).map((key) => key.slice(KEY_PREFIX.length));
  }

  async ready() {
    return this.connected;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }
}

module.exports = RedisStore;
