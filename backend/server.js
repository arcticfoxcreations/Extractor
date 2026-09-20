'use strict';

const app = require('./app');
const config = require('./config');
const cache = require('./cache');
const logger = require('./utils/logger');

async function start() {
  await cache.init();

  const server = app.listen(config.port, () => {
    logger.info('word extractor api listening', {
      port: config.port,
      env: config.env,
      cache: config.cache.driver
    });
  });

  // Free hosting tiers restart containers often; draining cleanly avoids
  // dropping a request mid-flight on every deploy.
  const shutdown = async (signal) => {
    logger.info('shutting down', { signal });
    server.close(async () => {
      await cache.shutdown();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', { reason: reason?.message || String(reason) });
  });
}

start().catch((error) => {
  logger.error('failed to start', { reason: error.message });
  process.exit(1);
});
