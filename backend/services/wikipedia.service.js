'use strict';

const config = require('../config');
const { fetchJson, buildUrl } = require('../utils/http');
const { stripWikiMarkup, normalizeSpace, uniqueBy } = require('../utils/text');

const lang = config.upstream.wikipediaLang;
const REST_BASE = `https://${lang}.wikipedia.org/api/rest_v1`;
const ACTION_BASE = `https://${lang}.wikipedia.org/w/api.php`;

// Maintenance categories that carry no meaning for a reader.
const CATEGORY_NOISE = /^(articles|all |cs1|webarchive|wikipedia|pages |use |commons|short description|good articles|featured|redirects|category:articles|category:all|category:cs1|category:webarchive|category:wikipedia|category:pages|category:use|category:commons|category:short|category:good|category:featured|category:redirects)/i;

/**
 * Finds the best matching article title. Search is used rather than jumping
 * straight to the summary endpoint so misspellings and inflected forms
 * ("mitochondrial" -> "Mitochondrion") still resolve.
 */
async function resolveTitle(query) {
  const url = buildUrl(ACTION_BASE, {
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: 3,
    srnamespace: 0,
    srinfo: '',
    srprop: 'snippet',
    format: 'json',
    origin: '*'
  });

  const data = await fetchJson(url, { source: 'wikipedia-search' });
  const results = data?.query?.search || [];
  if (results.length === 0) return null;

  return {
    title: results[0].title,
    alternatives: results.slice(1).map((item) => item.title)
  };
}

async function getSummary(title) {
  const url = `${REST_BASE}/page/summary/${encodeURIComponent(title)}?redirect=true`;
  const data = await fetchJson(url, { source: 'wikipedia-summary' });
  if (!data || data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
    return null;
  }

  return {
    title: data.title,
    canonicalTitle: data.titles?.canonical || data.title,
    description: normalizeSpace(data.description || ''),
    extract: stripWikiMarkup(data.extract || ''),
    thumbnail: data.thumbnail?.source || null,
    pageUrl: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    lastUpdated: data.timestamp || null,
    isDisambiguation: data.type === 'disambiguation',
    wikidataId: data.wikibase_item || null
  };
}

/**
 * Categories and outbound links in one round trip. Links are a reliable
 * source of related terms because they are hand-curated by editors.
 */
async function getContext(title) {
  const url = buildUrl(ACTION_BASE, {
    action: 'query',
    titles: title,
    prop: 'categories|links|pageprops',
    cllimit: 25,
    clshow: '!hidden',
    pllimit: 30,
    plnamespace: 0,
    redirects: 1,
    format: 'json',
    origin: '*'
  });

  const data = await fetchJson(url, { source: 'wikipedia-context' });
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) {
    return { categories: [], relatedTerms: [], wikidataId: null };
  }

  const categories = (page.categories || [])
    .map((item) => normalizeSpace(String(item.title).replace(/^Category:/, '')))
    .filter((name) => name && !CATEGORY_NOISE.test(name))
    .slice(0, 8);

  const relatedTerms = uniqueBy(
    (page.links || [])
      .map((item) => normalizeSpace(item.title))
      .filter((name) => name && !name.includes(':') && name.toLowerCase() !== title.toLowerCase()),
    (name) => name.toLowerCase()
  ).slice(0, 12);

  return {
    categories,
    relatedTerms,
    wikidataId: page.pageprops?.wikibase_item || null
  };
}

module.exports = { resolveTitle, getSummary, getContext };
