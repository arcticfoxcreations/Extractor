/* Cloudflare Worker build of the Word Extractor API.

   This is an alternative to the Express backend, not a wrapper around it:
   Workers have no Node runtime, so the logic is ported to the fetch handler
   and caching uses KV plus the edge Cache API instead of Redis.

   Routes match the Express app exactly, so the frontend needs no changes:
     GET  /api/search?q=term
     POST /api/extract
     GET  /api/health
     GET  /api/cache-stats */

const COMMON_WORDS = new Set(
  `a about above across after again against all almost also although always among an and another any are area around as ask at available average away back base based be because been before begin behind being below best better between both but by call called can cannot case cases cause center certain change changes clear close come common compare complete complex concept condition conditions consider considered contain content context continue control could country course create current data date day days defined definition degree describe described design detail details determine develop development did difference different difficult direct directly discussed distribution do does done down due during each early effect effects either end enough entire equal especially established even event ever every evidence exact example examples except exist existing expected experience experiment explain extent fact factor factors few field figure final finally find finding first five focus follow following for form found four from full further future gave general generally get give given go good got great greater group groups grow growth had half hand has have he health held help her here high higher him his hold how however human idea identified identify if impact important improve in include included includes including increase increased indicate individual information initial instead interest into introduce involve is issue it its itself just keep key kind know known lack large larger last late later least left length less let level levels light like likely limit limited line list little local long look low lower made main major make making many mark may mean means measure measured method methods might model models more moreover most move much multiple must name natural nature near necessary need needs never new next no none nor normal not note nothing now number numbers observed obtain obtained of off offer often on once one only open or order original other others our out over overall own paper part particular parts pattern per percent perform period person place plan play point points position positive possible potential power practice present presented pressure previous primary prior probably problem procedure process produce product project provide provided purpose put quality question quite random range rate rather reach read reason recent reduce reference region related relative remain remove report represent require required research respectively response result results return review right role rule run said same sample say scale school science scientific second section see seem seen select sense separate series serve set several shall shape share short should show shown side significant similar simple since single site situation six size small smaller so social some sometimes source sources space special specific standard start state states step steps still strong structure studied studies study subject such suggest sum summary support sure surface system systems table take taken task team technique technology tell temperature term terms test tested than that the their them then theory there therefore these they thing things think third this those though three through thus time times to today together too top total toward traditional treatment true try turn two type types typical under understand unit units until up upon us use used useful user uses using usually value values variable various very via view volume want was way ways we week weight well were what when where whether which while white who whole whose why wide will with within without word words work works world would write written year years yet you your zero
   ability account achieve activity addition adequate affect allow alternative analysis apparent appropriate approach argue assume attempt attention benefit body brief build calculate capable carry category collect combined compute conclude confirm consequence consistent constitute contrast contribute convert correspond critical crucial define demand density derive despite detect device difficulty disease display distinct diverse divide document dominant duration dynamic earth edge effective efficient element eliminate emerge emphasis employ enable energy ensure environment equation equipment error establish estimate evaluate examine exceed exclude exhibit expand expect explore expose express extend external extract facility failure familiar feature feedback flow fluid force formula foundation framework frequency frequent function fundamental generate goal guide handle heat height identical ignore illustrate image imply improve incidence indicate induce inherent initiate injury inner input insert insight instance instrument integrate intense internal interpret interval invest investigate involve isolate journal justify label layer learn legal liberal license link locate logic machine magnitude maintain manual manner margin mass mature maximum mechanism medical medium mental mention message minimum minor mixture mobile mode modify module monitor motion motor movement mutual narrow negative network neutral node norm notion nuclear objective observe obvious occupy occur offset ongoing operate option orient outcome output overlap panel parallel parameter passive peak perceive percentage phenomenon philosophy physical plot policy portion practical precise predict previous principle priority procedure proceed profile promote proportion protocol publish pursue radical ratio react reaction reject release relevant reliable rely require reside resolve resource restrict retain reveal reverse revise rigid route scenario schedule scheme scope secure seek sequence shift signal solution somewhat sought specify sphere stable statistic status strategy stress style submit subsequent substitute sufficient survey survive sustain symbol target technical temporary theme thesis topic trace tradition transfer transform transit transmit transport trend trigger ultimate undergo uniform unique valid vary vehicle version virtual visible vision visual whereas whereby widespread yield`
    .trim()
    .split(/\s+/)
);

const TECHNICAL_SUFFIXES = ['osis','itis','emia','ology','ography','ometry','ectomy','genesis','genic','morphic','tropic','trophy','lysis','lytic','phyll','plasm','cyte','blast','valent','philic','phobic','ase','ose','ide','ine','ium','oid'];
const TECHNICAL_PREFIXES = ['hydro','hyper','hypo','iso','macro','micro','nano','photo','poly','pseudo','thermo','electro','bio','geo','neuro','cyto','immuno','chemo','radio','ortho','meta','endo','exo','anti'];

const USER_AGENT = 'WordExtractor/1.0 (https://github.com/your-username/word-extractor; you@example.com)';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    try {
      const path = url.pathname.replace(/^\/api/, '') || '/';

      if (path === '/health') return json({ status: 'healthy', runtime: 'cloudflare-worker', time: new Date().toISOString() }, 200, env, origin);
      if (path === '/cache-stats') return json(await cacheStats(env), 200, env, origin);
      if (path === '/search') return handleSearch(url, env, ctx, origin);
      if (path === '/extract' && request.method === 'POST') return handleExtract(request, env, ctx, origin);

      return error(404, 'route_not_found', `No route matches ${request.method} ${url.pathname}.`, env, origin);
    } catch (err) {
      return error(500, 'internal_error', 'Something broke while building the explanation.', env, origin);
    }
  }
};

/* ---------- Routes ---------- */

async function handleSearch(url, env, ctx, origin) {
  const query = (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim();

  if (!query) return error(400, 'missing_query', 'Add a ?q= parameter with the term to look up.', env, origin);
  if (query.length > 120) return error(400, 'query_too_long', 'Keep the term under 120 characters.', env, origin);
  if (!/^[\p{L}\p{N} .'’\-/()+&]+$/u.test(query)) {
    return error(400, 'invalid_query', 'The term contains characters that are not allowed.', env, origin);
  }

  const key = `term:${query.toLowerCase()}`;
  const cached = env.WORD_CACHE ? await env.WORD_CACHE.get(key, 'json') : null;

  if (cached) {
    return json({ ...cached, cache: { status: 'hit' } }, 200, env, origin);
  }

  const entry = await buildEntry(query);

  if (env.WORD_CACHE) {
    // Written in the background so the reader is not waiting on the write.
    ctx.waitUntil(
      env.WORD_CACHE.put(key, JSON.stringify(entry), {
        expirationTtl: Number(env.CACHE_TTL_SECONDS || 86400)
      })
    );
  }

  return json({ ...entry, cache: { status: 'miss' } }, 200, env, origin);
}

async function handleExtract(request, env, ctx, origin) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text : '';

  if (text.trim().length < 40) {
    return error(400, 'text_too_short', 'Paste at least a paragraph of text to extract terms from.', env, origin);
  }
  if (text.length > 120000) {
    return error(413, 'text_too_long', 'Documents are limited to 120,000 characters.', env, origin);
  }

  const started = Date.now();
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 25, 1), 60);
  const explainCount = Math.min(parseInt(body.explainCount, 10) || 8, 20);

  const { terms, totalWords } = extractTerms(text, limit, parseInt(body.minScore, 10) || 4);

  let explained = [];
  if (body.explain !== false && terms.length > 0) {
    const head = terms.slice(0, explainCount);
    const settled = await Promise.allSettled(head.map((item) => cachedEntry(item.term, env, ctx)));
    explained = settled.map((result, index) =>
      result.status === 'fulfilled' ? result.value : { query: head[index].term, found: false }
    );
  }

  const byQuery = new Map(explained.map((entry) => [String(entry.query).toLowerCase(), entry]));

  return json(
    {
      totalWords,
      termCount: terms.length,
      durationMs: Date.now() - started,
      terms: terms.map((item) => ({ ...item, explanation: byQuery.get(item.term.toLowerCase()) || null }))
    },
    200,
    env,
    origin
  );
}

async function cachedEntry(term, env, ctx) {
  const key = `term:${term.toLowerCase()}`;
  const cached = env.WORD_CACHE ? await env.WORD_CACHE.get(key, 'json') : null;
  if (cached) return { ...cached, cache: { status: 'hit' } };

  const entry = await buildEntry(term);
  if (env.WORD_CACHE) {
    ctx.waitUntil(env.WORD_CACHE.put(key, JSON.stringify(entry), { expirationTtl: Number(env.CACHE_TTL_SECONDS || 86400) }));
  }
  return { ...entry, cache: { status: 'miss' } };
}

async function cacheStats(env) {
  if (!env.WORD_CACHE) return { driver: 'none', entries: 0, healthy: true };
  const listed = await env.WORD_CACHE.list({ limit: 1000 });
  return {
    driver: 'cloudflare-kv',
    healthy: true,
    entries: listed.keys.length,
    truncated: !listed.list_complete,
    recentKeys: listed.keys.slice(0, 15).map((item) => item.name)
  };
}

/* ---------- Sources ---------- */

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (response.status === 404 || !response.ok) return null;
  return response.json().catch(() => null);
}

async function buildEntry(query) {
  const lang = 'en';
  const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&srnamespace=0&format=json&origin=*`;

  const [searchData, dictionary] = await Promise.all([
    getJson(searchUrl).catch(() => null),
    getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query.toLowerCase())}`).catch(() => null)
  ]);

  const hits = searchData?.query?.search || [];
  const title = hits[0]?.title || null;

  let summary = null;
  let context = null;

  if (title) {
    const [summaryData, contextData] = await Promise.all([
      getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`).catch(() => null),
      getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=categories|links|pageprops&cllimit=25&clshow=!hidden&pllimit=30&plnamespace=0&redirects=1&format=json&origin=*`).catch(() => null)
    ]);
    summary = summaryData;
    context = contextData;
  }

  const page = context ? Object.values(context.query?.pages || {})[0] : null;
  const wikidataId = summary?.wikibase_item || page?.pageprops?.wikibase_item || null;

  let entity = null;
  if (wikidataId) {
    const entityData = await getJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=labels|descriptions|aliases&languages=en&format=json&origin=*`
    ).catch(() => null);
    entity = entityData?.entities?.[wikidataId] || null;
  }

  return assemble(query, { summary, page, dictionary, entity, wikidataId, alternatives: hits.slice(1).map((h) => h.title) });
}

function assemble(query, parts) {
  const { summary, page, dictionary, entity, wikidataId, alternatives } = parts;
  const dictEntry = Array.isArray(dictionary) ? dictionary[0] : null;

  const senses = [];
  for (const meaning of dictEntry?.meanings || []) {
    for (const def of (meaning.definitions || []).slice(0, 2)) {
      if (def.definition) senses.push({ partOfSpeech: meaning.partOfSpeech || 'Meaning', definition: clean(def.definition) });
    }
  }

  const entityDescription = clean(entity?.descriptions?.en?.value || '');
  const definition = [entityDescription, clean(summary?.description || ''), senses[0]?.definition]
    .filter((item) => item && item.length > 3)
    .sort((a, b) => a.length - b.length)[0] || '';

  const categories = (page?.categories || [])
    .map((item) => clean(String(item.title).replace(/^Category:/, '')))
    .filter((name) => name && !/^(articles|all |cs1|webarchive|wikipedia|pages |use |commons|short description|good articles|featured)/i.test(name))
    .slice(0, 8);

  const related = unique([
    ...(page?.links || []).map((item) => clean(item.title)).filter((name) => name && !name.includes(':')),
    ...(entity?.aliases?.en || []).map((item) => clean(item.value)),
    ...alternatives
  ]).filter((term) => term.toLowerCase() !== query.toLowerCase()).slice(0, 12);

  const sources = [];
  if (summary?.content_urls?.desktop?.page) sources.push({ name: 'Wikipedia', title: summary.title, url: summary.content_urls.desktop.page });
  if (wikidataId) sources.push({ name: 'Wikidata', title: entity?.labels?.en?.value || wikidataId, url: `https://www.wikidata.org/wiki/${wikidataId}` });
  if (dictEntry?.sourceUrls?.[0]) sources.push({ name: 'Wiktionary', title: dictEntry.word, url: dictEntry.sourceUrls[0] });

  const keyFacts = senses.slice(0, 2).map((sense) => ({
    label: sense.partOfSpeech.charAt(0).toUpperCase() + sense.partOfSpeech.slice(1),
    value: sense.definition
  }));

  return {
    query,
    found: Boolean(definition || summary?.extract || keyFacts.length),
    title: summary?.title || entity?.labels?.en?.value || dictEntry?.word || query,
    definition,
    summary: clean(summary?.extract || ''),
    pronunciation: clean(dictEntry?.phonetic || ''),
    keyFacts,
    relatedTerms: related,
    categories,
    thumbnail: summary?.thumbnail?.source || null,
    sources,
    lastUpdated: summary?.timestamp || null,
    retrievedAt: new Date().toISOString()
  };
}

/* ---------- Extraction ---------- */

function extractTerms(document, limit, minScore) {
  const text = clean(document);
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);
  const candidates = new Map();
  let totalWords = 0;

  sentences.forEach((sentence, sentenceIndex) => {
    const matches = sentence.match(/[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Z]{2,8}/g) || [];
    totalWords += matches.length;

    matches.forEach((raw, wordIndex) => {
      const token = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
      if (token.length < 2) return;

      const acronym = /^[A-Z]{2,8}$/.test(token);
      const key = acronym ? token : token.toLowerCase();
      const existing = candidates.get(key);
      if (existing) { existing.count += 1; return; }

      candidates.set(key, {
        display: acronym || (wordIndex > 0 && /^[A-Z]/.test(token)) ? token : token.toLowerCase(),
        count: 1,
        context: sentence.slice(0, 220)
      });
    });
  });

  const terms = [];
  for (const [, candidate] of candidates) {
    const score = scoreTerm(candidate.display, candidate.count, totalWords);
    if (score < minScore) continue;
    terms.push({ term: candidate.display, score, occurrences: candidate.count, context: candidate.context });
  }

  terms.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
  return { terms: terms.slice(0, limit), totalWords };
}

function scoreTerm(token, occurrences, totalWords) {
  const lower = token.toLowerCase();
  if (/^[A-Z]{2,8}$/.test(token)) return COMMON_WORDS.has(lower) ? 0 : 6;
  if (lower.length < 6 || COMMON_WORDS.has(lower)) return 0;

  for (const [suffix, cut] of [['s', 1], ['es', 2], ['ed', 2], ['ing', 3], ['ly', 2]]) {
    if (lower.endsWith(suffix) && COMMON_WORDS.has(lower.slice(0, -cut))) return 0;
  }
  if (lower.endsWith('ies') && COMMON_WORDS.has(`${lower.slice(0, -3)}y`)) return 0;

  let score = Math.min(4, Math.floor((lower.length - 5) / 2)) + Math.max(0, syllables(lower) - 2);
  if (TECHNICAL_SUFFIXES.some((s) => lower.endsWith(s))) score += 3;
  if (TECHNICAL_PREFIXES.some((p) => lower.startsWith(p) && lower.length > p.length + 2)) score += 3;
  if (occurrences === 1) score += 1;
  if (occurrences / Math.max(1, totalWords) > 0.004) score += 2;

  return score;
}

function syllables(word) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleaned.length <= 3) return 1;
  const groups = cleaned.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

/* ---------- Helpers ---------- */

function clean(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function unique(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item).toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((item) => item.trim());
  const value = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0] || '';

  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, env, origin) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ...corsHeaders(env, origin)
    }
  });
}

function error(status, code, message, env, origin) {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env, origin) }
  });
}
