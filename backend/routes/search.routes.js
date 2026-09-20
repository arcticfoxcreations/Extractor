'use strict';

const express = require('express');
const searchController = require('../controllers/search.controller');
const extractController = require('../controllers/extract.controller');
const fileController = require('../controllers/file.controller');
const { validateSearchQuery, validateExtractBody } = require('../middleware/validate');
const { searchLimiter, extractLimiter, fileLimiter } = require('../middleware/rateLimit');
const { singleDocument } = require('../middleware/upload');

const router = express.Router();

router.get('/search', searchLimiter, validateSearchQuery, searchController.search);
router.post('/extract', extractLimiter, validateExtractBody, extractController.extract);
router.post('/extract-file', fileLimiter, singleDocument, fileController.extractFile);

module.exports = router;
