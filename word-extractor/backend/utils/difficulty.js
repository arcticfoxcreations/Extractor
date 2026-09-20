'use strict';

const COMMON_WORDS = require('./common-words');
const { splitSentences, countSyllables, truncate, normalizeSpace } = require('./text');

// Endings that almost always mark specialist vocabulary in scientific writing.
const TECHNICAL_SUFFIXES = [
  'osis', 'itis', 'emia', 'ology', 'ologies', 'ography', 'ometry', 'ectomy',
  'genesis', 'genic', 'morphic', 'morphism', 'tropic', 'trophy', 'lysis', 'lytic',
  'phyll', 'plasm', 'cyte', 'blast', 'valent', 'philic', 'phobic', 'static',
  'ase', 'ose', 'ide', 'ine', 'ium', 'oid', 'yl'
];

const TECHNICAL_PREFIXES = [
  'hydro', 'hyper', 'hypo', 'iso', 'macro', 'micro', 'nano', 'photo', 'poly',
  'pseudo', 'quantum', 'stoch', 'thermo', 'electro', 'bio', 'geo', 'neuro',
  'cyto', 'immuno', 'chemo', 'radio', 'ortho', 'meta', 'endo', 'exo', 'anti'
];

const WORD_PATTERN = /[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Z]{2,8}/g;

function cleanToken(token) {
  return token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
}

function isAcronym(token) {
  return /^[A-Z]{2,8}$/.test(token);
}

function hasTechnicalShape(lower) {
  if (TECHNICAL_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;
  if (TECHNICAL_PREFIXES.some((prefix) => lower.startsWith(prefix) && lower.length > prefix.length + 2)) return true;
  return false;
}

/**
 * Returns 0 for words the reader can be expected to know, and a positive
 * score for candidates worth explaining. Higher means harder.
 */
function scoreTerm(token, occurrences, totalWords) {
  const lower = token.toLowerCase();

  if (isAcronym(token)) {
    return COMMON_WORDS.has(lower) ? 0 : 6;
  }

  if (lower.length < 6) return 0;
  if (COMMON_WORDS.has(lower)) return 0;
  // Plurals and simple inflections of common words are not hard words.
  if (lower.endsWith('s') && COMMON_WORDS.has(lower.slice(0, -1))) return 0;
  if (lower.endsWith('es') && COMMON_WORDS.has(lower.slice(0, -2))) return 0;
  if (lower.endsWith('ed') && COMMON_WORDS.has(lower.slice(0, -2))) return 0;
  if (lower.endsWith('ing') && COMMON_WORDS.has(lower.slice(0, -3))) return 0;
  if (lower.endsWith('ly') && COMMON_WORDS.has(lower.slice(0, -2))) return 0;
  if (lower.endsWith('ies') && COMMON_WORDS.has(`${lower.slice(0, -3)}y`)) return 0;
  if (lower.endsWith('ness') && COMMON_WORDS.has(lower.slice(0, -4))) return 0;

  let score = 0;
  score += Math.min(4, Math.floor((lower.length - 5) / 2));
  score += Math.max(0, countSyllables(lower) - 2);
  if (hasTechnicalShape(lower)) score += 3;

  // A word that appears once in a long document is more likely to be a term
  // the reader stumbled on; a word repeated constantly is the paper's subject
  // and also worth explaining, so both ends get a small lift.
  const frequencyRatio = occurrences / Math.max(1, totalWords);
  if (occurrences === 1) score += 1;
  if (frequencyRatio > 0.004) score += 2;

  return score;
}

/**
 * Scans a document and returns the terms most likely to need a gloss,
 * each with the sentence it first appeared in.
 */
function extractTerms(document, { limit = 40, minScore = 4 } = {}) {
  const text = normalizeSpace(document);
  if (!text) return { terms: [], totalWords: 0 };

  const sentences = splitSentences(text);
  const candidates = new Map();
  let totalWords = 0;

  sentences.forEach((sentence, sentenceIndex) => {
    const matches = sentence.match(WORD_PATTERN) || [];
    totalWords += matches.length;

    matches.forEach((raw, wordIndex) => {
      const token = cleanToken(raw);
      if (token.length < 2) return;

      const key = isAcronym(token) ? token : token.toLowerCase();
      const existing = candidates.get(key);

      if (existing) {
        existing.count += 1;
        return;
      }

      candidates.set(key, {
        key,
        // Keep the original casing unless the word only opened a sentence.
        display: isAcronym(token) || (wordIndex > 0 && /^[A-Z]/.test(token)) ? token : token.toLowerCase(),
        count: 1,
        sentenceIndex,
        context: sentence
      });
    });
  });

  const terms = [];
  for (const candidate of candidates.values()) {
    const score = scoreTerm(candidate.display, candidate.count, totalWords);
    if (score < minScore) continue;

    terms.push({
      term: candidate.display,
      key: candidate.key,
      score,
      occurrences: candidate.count,
      context: truncate(candidate.context, 220)
    });
  }

  terms.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));

  return { terms: terms.slice(0, limit), totalWords };
}

module.exports = { extractTerms, scoreTerm };
