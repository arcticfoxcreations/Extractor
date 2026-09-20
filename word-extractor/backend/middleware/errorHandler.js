'use strict';

const config = require('../config');
const logger = require('../utils/logger');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function notFound(req, res, next) {
  next(new ApiError(404, 'route_not_found', `No route matches ${req.method} ${req.path}.`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity.
function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const code = error.code || (status === 500 ? 'internal_error' : 'request_failed');

  const message =
    status === 500
      ? 'Something broke while building the explanation. Try again in a moment.'
      : error.message;

  if (status >= 500) {
    logger.error('request failed', {
      path: req.originalUrl,
      code,
      reason: error.message,
      stack: config.env === 'development' ? error.stack : undefined
    });
  } else {
    logger.debug('request rejected', { path: req.originalUrl, code, status });
  }

  res.status(status).json({
    ok: false,
    error: { code, message },
    requestId: req.id
  });
}

module.exports = { ApiError, notFound, errorHandler };
