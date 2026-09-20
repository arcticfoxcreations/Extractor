'use strict';

const { randomUUID } = require('node:crypto');
const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  req.id = req.get('x-request-id') || randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : 'info';

    logger[level]('request', {
      id: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      cache: res.getHeader('X-Cache') || undefined
    });
  });

  next();
}

module.exports = requestLogger;
