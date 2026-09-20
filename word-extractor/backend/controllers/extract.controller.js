'use strict';

const { extractTerms } = require('../utils/difficulty');
const aggregator = require('../services/aggregator.service');

/**
 * Takes a block of paper text and returns the hard words in it. The top
 * handful are explained inline so the reader view has content immediately;
 * the rest are explained on demand through GET /api/search when clicked.
 */
async function extract(req, res, next) {
  try {
    const { text, limit, minScore, explain, explainCount } = req.validated;
    const startedAt = Date.now();

    const { terms, totalWords } = extractTerms(text, { limit, minScore });

    let explanations = [];
    if (explain && terms.length > 0) {
      const head = terms.slice(0, explainCount).map((item) => item.term);
      explanations = await aggregator.explainMany(head);
    }

    const byQuery = new Map(explanations.map((entry) => [entry.query.toLowerCase(), entry]));

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      data: {
        totalWords,
        termCount: terms.length,
        durationMs: Date.now() - startedAt,
        terms: terms.map((item) => ({
          ...item,
          explanation: byQuery.get(item.term.toLowerCase()) || null
        }))
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { extract };
