'use strict';

const config = require('../config');
const { extractText } = require('../services/fileExtract.service');
const { ApiError } = require('../middleware/errorHandler');
const { truncate } = require('../utils/text');

function extensionOf(filename) {
  const match = /\.[a-z0-9]+$/i.exec(String(filename || ''));
  return match ? match[0].toLowerCase() : '';
}

/**
 * Accepts one document, pulls its text out in memory, and responds. The
 * upload buffer (req.file.buffer) is never written to disk and goes out of
 * scope the moment this function returns — nothing about the file survives
 * the request.
 */
async function extractFile(req, res, next) {
  try {
    if (!req.file) {
      throw new ApiError(400, 'missing_file', 'Attach a file first.');
    }

    const ext = req.file.detectedExt || extensionOf(req.file.originalname);
    let text = await extractText(req.file.buffer, ext);

    const truncated = text.length > config.limits.maxDocumentChars;
    if (truncated) {
      text = truncate(text, config.limits.maxDocumentChars);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      data: {
        filename: req.file.originalname,
        chars: text.length,
        truncated,
        text
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { extractFile };
