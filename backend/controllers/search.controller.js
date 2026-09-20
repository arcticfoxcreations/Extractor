'use strict';

const aggregator = require('../services/aggregator.service');
const config = require('../config');

async function search(req, res, next) {
  try {
    const { query } = req.validated;
    const result = await aggregator.explain(query);

    res.setHeader('X-Cache', result.cache?.status || 'miss');
    // Let Cloudflare and the browser reuse the response too.
    res.setHeader(
      'Cache-Control',
      `public, max-age=300, s-maxage=${config.cache.ttlSeconds}, stale-while-revalidate=${config.cache.staleSeconds}`
    );

    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = { search };
