'use strict';

const config = require('../config');
const { fetchJson } = require('../utils/http');
const { normalizeSpace, uniqueBy } = require('../utils/text');

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en';

/**
 * Free Dictionary API. Wikipedia explains concepts; this explains words,
 * which matters when a paper uses an ordinary-but-unfamiliar term that has
 * no encyclopaedia article of its own.
 */
async function lookup(word) {
  if (!config.upstream.enableDictionary) return null;

  // Multi-word phrases are never in the dictionary; skip the round trip.
  if (/\s/.test(word.trim())) return null;

  const data = await fetchJson(`${API}/${encodeURIComponent(word.trim().toLowerCase())}`, {
    source: 'dictionary',
    retries: 0
  });

  if (!Array.isArray(data) || data.length === 0) return null;

  const entry = data[0];
  const senses = [];

  for (const meaning of entry.meanings || []) {
    for (const definition of (meaning.definitions || []).slice(0, 2)) {
      if (!definition.definition) continue;
      senses.push({
        partOfSpeech: normalizeSpace(meaning.partOfSpeech || ''),
        definition: normalizeSpace(definition.definition),
        example: definition.example ? normalizeSpace(definition.example) : null
      });
    }
  }

  const synonyms = uniqueBy(
    (entry.meanings || []).flatMap((meaning) => meaning.synonyms || []).map(normalizeSpace),
    (item) => item.toLowerCase()
  ).slice(0, 8);

  if (senses.length === 0) return null;

  return {
    word: normalizeSpace(entry.word),
    phonetic: normalizeSpace(entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || ''),
    audio: entry.phonetics?.find((p) => p.audio)?.audio || null,
    senses: senses.slice(0, 4),
    synonyms,
    sourceUrl: entry.sourceUrls?.[0] || null
  };
}

module.exports = { lookup };
