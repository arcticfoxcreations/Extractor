'use strict';

const express = require('express');
const searchController = require('../controllers/search.controller');
const extractController = require('../controllers/extract.controller');
const { validateSearchQuery, validateExtractBody } = require('../middleware/validate');
const { searchLimiter, extractLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/search', searchLimiter, validateSearchQuery, searchController.search);
router.post('/extract', extractLimiter, validateExtractBody, extractController.extract);

module.exports = router;
