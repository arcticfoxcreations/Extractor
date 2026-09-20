'use strict';

require('dotenv').config();

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toList(value, fallback) {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 8080),
  logLevel: process.env.LOG_LEVEL || 'info',

  // Wikimedia asks every client to identify itself. Requests without a
  // descriptive User-Agent get throttled or blocked outright.
  userAgent:
    process.env.USER_AGENT ||
    'WordExtractor/1.0 (https://github.com/your-username/word-extractor; contact@example.com)',

  cors: {
    // '*' is fine for a public read-only API. Narrow it once the Pages URL is known.
    allowedOrigins: toList(process.env.ALLOWED_ORIGINS, ['*'])
  },

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    maxRequests: toInt(process.env.RATE_LIMIT_MAX, 60),
    extractMax: toInt(process.env.RATE_LIMIT_EXTRACT_MAX, 15)
  },

  cache: {
    driver: process.env.CACHE_DRIVER || (process.env.REDIS_URL ? 'redis' : 'memory'),
    redisUrl: process.env.REDIS_URL || '',
    ttlSeconds: toInt(process.env.CACHE_TTL_SECONDS, 60 * 60 * 24),
    // Stale entries are still served while a fresh copy is fetched in the
    // background, so a cache expiry never costs the user a slow response.
    staleSeconds: toInt(process.env.CACHE_STALE_SECONDS, 60 * 60 * 24 * 6),
    maxEntries: toInt(process.env.CACHE_MAX_ENTRIES, 2000)
  },

  upstream: {
    timeoutMs: toInt(process.env.UPSTREAM_TIMEOUT_MS, 6000),
    retries: toInt(process.env.UPSTREAM_RETRIES, 1),
    wikipediaLang: process.env.WIKIPEDIA_LANG || 'en',
    enableDictionary: process.env.ENABLE_DICTIONARY !== 'false'
  },

  limits: {
    maxQueryLength: toInt(process.env.MAX_QUERY_LENGTH, 120),
    maxDocumentChars: toInt(process.env.MAX_DOCUMENT_CHARS, 120_000),
    maxExtractedTerms: toInt(process.env.MAX_EXTRACTED_TERMS, 60)
  }
};

module.exports = config;
