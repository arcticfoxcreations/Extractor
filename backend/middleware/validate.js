'use strict';

const config = require('../config');
const { ApiError } = require('./errorHandler');

// Letters (including accented), digits, spaces and the punctuation that shows
// up inside real terms: hyphen, apostrophe, dot, slash, parentheses, plus.
const QUERY_PATTERN = /^[\p{L}\p{N} .'’\-/()+&]+$/u;

function validateSearchQuery(req, res, next) {
  const raw = req.query.q ?? req.query.query ?? '';
  const query = String(raw).replace(/\s+/g, ' ').trim();

  if (query.length === 0) {
    return next(new ApiError(400, 'missing_query', 'Add a ?q= parameter with the term to look up.'));
  }

  if (query.length > config.limits.maxQueryLength) {
    return next(
      new ApiError(
        400,
        'query_too_long',
        `Keep the term under ${config.limits.maxQueryLength} characters.`
      )
    );
  }

  if (!QUERY_PATTERN.test(query)) {
    return next(
      new ApiError(400, 'invalid_query', 'The term contains characters that are not allowed.')
    );
  }

  req.validated = { query };
  return next();
}

function validateExtractBody(req, res, next) {
  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text : '';

  if (text.trim().length < 40) {
    return next(
      new ApiError(400, 'text_too_short', 'Paste at least a paragraph of text to extract terms from.')
    );
  }

  if (text.length > config.limits.maxDocumentChars) {
    return next(
      new ApiError(
        413,
        'text_too_long',
        `Documents are limited to ${config.limits.maxDocumentChars.toLocaleString('en-US')} characters. Split the paper and try again.`
      )
    );
  }

  const requestedLimit = Number.parseInt(body.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), config.limits.maxExtractedTerms)
    : 25;

  const requestedMinScore = Number.parseInt(body.minScore, 10);
  const minScore = Number.isFinite(requestedMinScore)
    ? Math.min(Math.max(requestedMinScore, 1), 20)
    : 4;

  req.validated = {
    text,
    limit,
    minScore,
    explain: body.explain !== false,
    explainCount: Math.min(Number.parseInt(body.explainCount, 10) || 8, 20)
  };

  return next();
}

module.exports = { validateSearchQuery, validateExtractBody };
