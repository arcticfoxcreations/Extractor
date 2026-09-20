'use strict';

const { fetchJson, buildUrl } = require('../utils/http');
const { normalizeSpace, uniqueBy } = require('../utils/text');

const API = 'https://www.wikidata.org/w/api.php';

// Properties that produce a useful one-line fact for a general reader.
const FACT_PROPERTIES = {
  P31: 'Instance of',
  P279: 'Subclass of',
  P361: 'Part of',
  P527: 'Has part',
  P2079: 'Made from',
  P186: 'Material',
  P575: 'Discovered',
  P61: 'Discovered by',
  P170: 'Created by',
  P571: 'First described',
  P1542: 'Causes',
  P780: 'Symptoms',
  P2176: 'Treated by',
  P921: 'Main subject',
  P366: 'Used for',
  P2670: 'Has parts of class',
  P101: 'Field of work'
};

async function searchEntity(query) {
  const url = buildUrl(API, {
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: 1,
    format: 'json',
    origin: '*'
  });

  const data = await fetchJson(url, { source: 'wikidata-search' });
  const first = data?.search?.[0];
  return first ? first.id : null;
}

/**
 * Loads an entity and turns its statements into readable facts. Claim values
 * are entity IDs, so a second batched call resolves them to labels.
 */
async function getEntityFacts(entityId) {
  if (!entityId) return null;

  const url = buildUrl(API, {
    action: 'wbgetentities',
    ids: entityId,
    props: 'labels|descriptions|aliases|claims',
    languages: 'en',
    format: 'json',
    origin: '*'
  });

  const data = await fetchJson(url, { source: 'wikidata-entity' });
  const entity = data?.entities?.[entityId];
  if (!entity || entity.missing !== undefined) return null;

  const claims = entity.claims || {};
  const referencedIds = new Set();
  const rawFacts = [];

  for (const [property, label] of Object.entries(FACT_PROPERTIES)) {
    const statements = claims[property];
    if (!statements) continue;

    for (const statement of statements.slice(0, 3)) {
      const value = statement.mainsnak?.datavalue;
      if (!value) continue;

      if (value.type === 'wikibase-entityid' && value.value.id) {
        referencedIds.add(value.value.id);
        rawFacts.push({ label, type: 'entity', ref: value.value.id });
      } else if (value.type === 'time' && value.value.time) {
        rawFacts.push({ label, type: 'value', text: formatTime(value.value.time) });
      } else if (value.type === 'string') {
        rawFacts.push({ label, type: 'value', text: normalizeSpace(value.value) });
      }
    }
  }

  const labels = referencedIds.size > 0 ? await resolveLabels([...referencedIds]) : {};

  const facts = uniqueBy(
    rawFacts
      .map((fact) => ({
        label: fact.label,
        value: fact.type === 'entity' ? labels[fact.ref] : fact.text
      }))
      .filter((fact) => Boolean(fact.value)),
    (fact) => `${fact.label}:${fact.value}`.toLowerCase()
  ).slice(0, 8);

  return {
    entityId,
    label: entity.labels?.en?.value || null,
    description: normalizeSpace(entity.descriptions?.en?.value || ''),
    aliases: (entity.aliases?.en || []).map((item) => normalizeSpace(item.value)).slice(0, 6),
    facts,
    url: `https://www.wikidata.org/wiki/${entityId}`
  };
}

async function resolveLabels(ids) {
  const output = {};

  // wbgetentities accepts 50 ids per call.
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const url = buildUrl(API, {
      action: 'wbgetentities',
      ids: batch.join('|'),
      props: 'labels',
      languages: 'en',
      format: 'json',
      origin: '*'
    });

    const data = await fetchJson(url, { source: 'wikidata-labels' });
    for (const [id, entity] of Object.entries(data?.entities || {})) {
      const label = entity?.labels?.en?.value;
      if (label) output[id] = normalizeSpace(label);
    }
  }

  return output;
}

function formatTime(raw) {
  // Wikidata times look like "+1953-04-25T00:00:00Z".
  const match = /^[+-](\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return normalizeSpace(raw);

  const [, year, month, day] = match;
  if (month === '00') return year;
  if (day === '00') return `${year}-${month}`;
  return `${day}/${month}/${year}`;
}

module.exports = { searchEntity, getEntityFacts };
