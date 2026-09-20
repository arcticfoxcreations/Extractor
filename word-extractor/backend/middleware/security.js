'use strict';

const cors = require('cors');
const helmet = require('helmet');
const config = require('../config');
const { ApiError } = require('./errorHandler');

const allowed = config.cors.allowedOrigins;
const allowAll = allowed.includes('*');

const corsMiddleware = cors({
  origin(origin, callback) {
    // Same-origin requests, curl and health checks arrive without an Origin.
    if (!origin || allowAll || allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(new ApiError(403, 'origin_not_allowed', 'This origin is not permitted.'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Request-Id'],
  exposedHeaders: ['X-Cache', 'X-Request-Id', 'RateLimit-Remaining'],
  maxAge: 86_400
});

const helmetMiddleware = helmet({
  // This process serves JSON only; the frontend is hosted separately.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' }
});

module.exports = { corsMiddleware, helmetMiddleware };
