'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');

function buildLimiter(max, code) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const retryAfter = Math.ceil(config.rateLimit.windowMs / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        ok: false,
        error: {
          code,
          message: `Too many requests. Wait ${retryAfter} seconds and try again.`
        }
      });
    }
  });
}

// Extraction fans out into many upstream calls, so it gets a tighter budget.
const searchLimiter = buildLimiter(config.rateLimit.maxRequests, 'rate_limited');
const extractLimiter = buildLimiter(config.rateLimit.extractMax, 'rate_limited_extract');
// Parsing a document is the most expensive thing this server does, so it
// gets the tightest budget of the three.
const fileLimiter = buildLimiter(config.rateLimit.extractMax, 'rate_limited_file');

module.exports = { searchLimiter, extractLimiter, fileLimiter };
