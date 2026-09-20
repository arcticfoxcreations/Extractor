'use strict';

const cache = require('../cache');
const config = require('../config');

const bootedAt = Date.now();

async function health(req, res) {
  const stats = await cache.snapshot();

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    data: {
      status: 'healthy',
      env: config.env,
      uptimeSeconds: Math.round((Date.now() - bootedAt) / 1000),
      cache: { driver: stats.driver, healthy: stats.healthy, entries: stats.entries },
      version: require('../package.json').version,
      time: new Date().toISOString()
    }
  });
}

async function cacheStats(req, res) {
  const stats = await cache.snapshot();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, data: stats });
}

module.exports = { health, cacheStats };
