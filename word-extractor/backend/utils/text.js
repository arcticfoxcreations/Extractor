'use strict';

const WHITESPACE = /\s+/g;

function normalizeSpace(value) {
  return String(value || '').replace(WHITESPACE, ' ').trim();
}

function normalizeKey(value) {
  return normalizeSpace(value).toLowerCase();
}

function stripWikiMarkup(value) {
  // The action API returns HTML entities and reference markers in some fields.
  return normalizeSpace(
    String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[\d+\]/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  );
}

function splitSentences(value) {
  const text = normalizeSpace(value);
  if (!text) return [];
  // Guard the common abbreviations that would otherwise split a sentence early.
  const guarded = text
    .replace(/\b(e\.g|i\.e|et al|vs|approx|Fig|Eq|Dr|Prof|No)\./g, '$1<DOT>')
    .replace(/(\d)\.(\d)/g, '$1<DOT>$2');

  return guarded
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((sentence) => sentence.replace(/<DOT>/g, '.').trim())
    .filter((sentence) => sentence.length > 0);
}

function firstSentence(value) {
  const sentences = splitSentences(value);
  return sentences.length > 0 ? sentences[0] : '';
}

function truncate(value, maxLength) {
  const text = normalizeSpace(value);
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : cut.length).trim()}…`;
}

function countSyllables(word) {
  const clean = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length === 0) return 0;
  if (clean.length <= 3) return 1;

  const groups = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);

  return groups ? groups.length : 1;
}

function titleCase(value) {
  return normalizeSpace(value)
    .split(' ')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

module.exports = {
  normalizeSpace,
  normalizeKey,
  stripWikiMarkup,
  splitSentences,
  firstSentence,
  truncate,
  countSyllables,
  titleCase,
  uniqueBy
};
