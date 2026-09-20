'use strict';

const config = require('../config');
const logger = require('./logger');

class UpstreamError extends Error {
  constructor(message, status, source) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.source = source;
  }
}

function buildUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Fetch JSON from a public API. One retry covers the transient DNS/TLS blips
 * that free hosting tiers produce; anything past that is treated as a real
 * upstream failure so callers can degrade instead of hanging.
 */
async function fetchJson(url, options = {}) {
  const { source = 'upstream', headers = {}, retries = config.upstream.retries } = options;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.upstream.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': config.userAgent,
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          ...headers
        }
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new UpstreamError(`${source} responded with ${response.status}`, response.status, source);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === retries;
      logger.debug('upstream request failed', {
        source,
        attempt: attempt + 1,
        reason: error.name === 'AbortError' ? 'timeout' : error.message
      });
      if (isLastAttempt) break;
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError && lastError.name === 'AbortError') {
    throw new UpstreamError(`${source} timed out`, 504, source);
  }
  throw lastError instanceof UpstreamError
    ? lastError
    : new UpstreamError(`${source} is unreachable`, 502, source);
}

/**
 * Runs every task in parallel and never rejects. A missing Wikidata entry
 * should not take down a response that already has a good Wikipedia summary.
 */
async function settleAll(tasks) {
  const results = await Promise.allSettled(tasks.map((task) => task.run()));
  const output = {};

  results.forEach((result, index) => {
    const { name } = tasks[index];
    if (result.status === 'fulfilled') {
      output[name] = result.value;
    } else {
      output[name] = null;
      logger.warn('optional source failed', { source: name, reason: result.reason?.message });
    }
  });

  return output;
}

module.exports = { fetchJson, buildUrl, settleAll, UpstreamError };
