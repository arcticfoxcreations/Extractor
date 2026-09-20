'use strict';

const express = require('express');
const compression = require('compression');

const routes = require('./routes');
const requestLogger = require('./middleware/requestLogger');
const { corsMiddleware, helmetMiddleware } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Render, Railway and Cloudflare all sit behind a proxy; without this the
// rate limiter would see one shared IP for every visitor.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Mounted twice so both /api/search and /search resolve. Hosting platforms
// tend to probe /health directly, and the shorter paths are easier to type.
app.use('/api', routes);
app.use('/', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
