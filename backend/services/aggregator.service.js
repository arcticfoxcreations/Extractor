'use strict';

const config = require('../config');
const cache = require('../cache');
const logger = require('../utils/logger');
const wikipedia = require('./wikipedia.service');
const wikidata = require('./wikidata.service');
const dictionary = require('./dictionary.service');
const { settleAll } = require('../utils/http');
const {
  normalizeKey,
  firstSentence,
  truncate,
  uniqueBy,
  titleCase
} = require('../utils/text');

/**
 * Builds the explanation for a single term.
 *
 * Shape of the work:
 *   1. Resolve the query to a Wikipedia title and hit the dictionary in parallel.
 *   2. With the title known, fetch summary + page context in parallel.
 *   3. Fetch Wikidata using the ID Wikipedia already gave us, avoiding a search.
 */
async function buildEntry(query) {
  const stage1 = await settleAll([
    { name: 'resolved', run: () => wikipedia.resolveTitle(query) },
    { name: 'dictionaryEntry', run: () => dictionary.lookup(query) }
  ]);

  const title = stage1.resolved?.title || null;

  const stage2 = title
    ? await settleAll([
        { name: 'summary', run: () => wikipedia.getSummary(title) },
        { name: 'context', run: () => wikipedia.getContext(title) }
      ])
    : { summary: null, context: null };

  const wikidataId = stage2.summary?.wikidataId || stage2.context?.wikidataId || null;

  let entity = null;
  if (wikidataId) {
    entity = await wikidata.getEntityFacts(wikidataId).catch(() => null);
  } else if (!stage2.summary && !stage1.dictionaryEntry) {
    // Nothing found yet, so it is worth paying for a Wikidata search.
    const searched = await wikidata.searchEntity(query).catch(() => null);
    entity = searched ? await wikidata.getEntityFacts(searched).catch(() => null) : null;
  }

  return assemble(query, {
    summary: stage2.summary,
    context: stage2.context,
    dictionaryEntry: stage1.dictionaryEntry,
    entity,
    alternatives: stage1.resolved?.alternatives || []
  });
}

function assemble(query, parts) {
  const { summary, context, dictionaryEntry, entity, alternatives } = parts;

  const definition = pickDefinition({ summary, dictionaryEntry, entity });
  const longSummary = summary?.extract || '';

  const keyFacts = [];

  if (dictionaryEntry?.senses?.length) {
    dictionaryEntry.senses.slice(0, 2).forEach((sense) => {
      keyFacts.push({
        label: sense.partOfSpeech ? titleCase(sense.partOfSpeech) : 'Meaning',
        value: sense.definition
      });
    });
  }

  if (entity?.facts?.length) {
    keyFacts.push(...entity.facts);
  }

  const relatedTerms = uniqueBy(
    [
      ...(context?.relatedTerms || []),
      ...(entity?.aliases || []),
      ...(dictionaryEntry?.synonyms || []),
      ...alternatives
    ].filter(Boolean),
    (term) => term.toLowerCase()
  )
    .filter((term) => term.toLowerCase() !== query.toLowerCase())
    .slice(0, 12);

  const sources = [];
  if (summary?.pageUrl) {
    sources.push({ name: 'Wikipedia', title: summary.title, url: summary.pageUrl });
  }
  if (entity?.url) {
    sources.push({ name: 'Wikidata', title: entity.label || entity.entityId, url: entity.url });
  }
  if (dictionaryEntry?.sourceUrl) {
    sources.push({ name: 'Wiktionary', title: dictionaryEntry.word, url: dictionaryEntry.sourceUrl });
  }

  const found = Boolean(definition || longSummary || keyFacts.length > 0);

  return {
    query,
    found,
    title: summary?.title || entity?.label || dictionaryEntry?.word || titleCase(query),
    definition,
    summary: longSummary,
    pronunciation: dictionaryEntry?.phonetic || null,
    audio: dictionaryEntry?.audio || null,
    keyFacts: uniqueBy(keyFacts, (fact) => `${fact.label}:${fact.value}`.toLowerCase()).slice(0, 8),
    relatedTerms,
    categories: context?.categories || [],
    thumbnail: summary?.thumbnail || null,
    sources,
    ambiguous: Boolean(summary?.isDisambiguation),
    lastUpdated: summary?.lastUpdated || null,
    retrievedAt: new Date().toISOString()
  };
}

/**
 * A gloss box has room for one or two lines, so the shortest accurate
 * sentence wins: Wikidata descriptions are written to be exactly that.
 */
function pickDefinition({ summary, dictionaryEntry, entity }) {
  const candidates = [
    entity?.description,
    summary?.description,
    dictionaryEntry?.senses?.[0]?.definition,
    firstSentence(summary?.extract || '')
  ].filter((item) => item && item.length > 3);

  if (candidates.length === 0) return '';

  const short = candidates.find((item) => item.length <= 160);
  return truncate(short || candidates[0], 220);
}

async function explain(query) {
  const key = `term:${config.upstream.wikipediaLang}:${normalizeKey(query)}`;
  const { value, cache: meta } = await cache.wrap(key, () => buildEntry(query));
  return { ...value, cache: meta };
}

/**
 * Explains several terms at once for the reader view. Cached terms resolve
 * instantly; the rest are fetched in small batches so a 40-term paper does
 * not open 120 sockets against Wikimedia at the same time.
 */
async function explainMany(terms, { batchSize = 5 } = {}) {
  const results = [];

  for (let index = 0; index < terms.length; index += batchSize) {
    const batch = terms.slice(index, index + batchSize);
    const settled = await Promise.allSettled(batch.map((term) => explain(term)));

    settled.forEach((result, offset) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logger.warn('term explanation failed', {
          term: batch[offset],
          reason: result.reason?.message
        });
        results.push({
          query: batch[offset],
          found: false,
          title: titleCase(batch[offset]),
          definition: '',
          summary: '',
          keyFacts: [],
          relatedTerms: [],
          categories: [],
          sources: [],
          error: 'lookup_failed',
          retrievedAt: new Date().toISOString()
        });
      }
    });
  }

  return results;
}

module.exports = { explain, explainMany };
