'use strict';

const express = require('express');
const systemController = require('../controllers/system.controller');

const router = express.Router();

router.get('/health', systemController.health);
router.get('/cache-stats', systemController.cacheStats);

module.exports = router;
