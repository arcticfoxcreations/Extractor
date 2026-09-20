'use strict';

const express = require('express');
const searchRoutes = require('./search.routes');
const systemRoutes = require('./system.routes');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    ok: true,
    data: {
      name: 'Word Extractor API',
      endpoints: {
        'GET /api/search?q=term': 'Explain a single term',
        'POST /api/extract': 'Find and explain difficult terms in a block of text',
        'GET /api/health': 'Service health',
        'GET /api/cache-stats': 'Cache counters'
      }
    }
  });
});

router.use('/', searchRoutes);
router.use('/', systemRoutes);

module.exports = router;
