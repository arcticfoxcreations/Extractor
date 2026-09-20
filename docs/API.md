# API reference

Base URL is wherever the backend is deployed. Every route is available both at
the root and under `/api`, so `/search` and `/api/search` are equivalent.

All responses are JSON and share one envelope:

```json
{ "ok": true, "data": { } }
```

```json
{ "ok": false, "error": { "code": "missing_query", "message": "Add a ?q= parameter with the term to look up." } }
```

Errors carry a machine-readable `code` and a message written for the person
reading the screen. Responses also include `requestId`, which matches the
`X-Request-Id` header and the server log line for that request.

---

## GET /api/search

Explains a single term by combining Wikipedia, Wikidata and the Free
Dictionary API.

| Parameter | Required | Notes |
|---|---|---|
| `q` | yes | The term. 1–120 characters. `query` is accepted as an alias. |

```bash
curl "http://localhost:8080/api/search?q=apoptosis"
```

```json
{
  "ok": true,
  "data": {
    "query": "apoptosis",
    "found": true,
    "title": "Apoptosis",
    "definition": "programmed cell death in multicellular organisms",
    "summary": "Apoptosis is a form of programmed cell death that occurs in multicellular organisms…",
    "pronunciation": "/ˌapəpˈtəʊsɪs/",
    "audio": "https://…/apoptosis.mp3",
    "keyFacts": [
      { "label": "Noun", "value": "The death of cells which occurs as a normal part of growth." },
      { "label": "Instance of", "value": "biological process" }
    ],
    "relatedTerms": ["Caspase", "Necrosis", "cell suicide"],
    "categories": ["Cell biology"],
    "thumbnail": "https://…/apoptosis.jpg",
    "sources": [
      { "name": "Wikipedia", "title": "Apoptosis", "url": "https://en.wikipedia.org/wiki/Apoptosis" },
      { "name": "Wikidata", "title": "apoptosis", "url": "https://www.wikidata.org/wiki/Q14277" }
    ],
    "ambiguous": false,
    "lastUpdated": "2026-08-01T10:00:00Z",
    "retrievedAt": "2026-09-20T10:55:10.485Z",
    "cache": { "status": "miss", "ageSeconds": 0 }
  }
}
```

`cache.status` is `hit`, `stale` or `miss`. A `stale` response was served
immediately from cache while a fresh copy was fetched in the background.

A term nobody can describe returns HTTP 200 with `found: false` rather than a
404 — the lookup succeeded, the answer was simply empty.

**Errors:** `missing_query` (400), `query_too_long` (400), `invalid_query`
(400), `rate_limited` (429).

---

## POST /api/extract

Finds the difficult terms in a block of text and explains the hardest ones.

```json
{
  "text": "Apoptosis is a form of programmed cell death…",
  "limit": 30,
  "minScore": 4,
  "explain": true,
  "explainCount": 8
}
```

| Field | Default | Notes |
|---|---|---|
| `text` | required | 40 to 120,000 characters. |
| `limit` | 25 | How many terms to return. Capped at 60. |
| `minScore` | 4 | Difficulty threshold. Raise it for only the hardest words. |
| `explain` | `true` | Whether to attach explanations inline. |
| `explainCount` | 8 | How many of the top terms to explain. Capped at 20. |

```json
{
  "ok": true,
  "data": {
    "totalWords": 67,
    "termCount": 12,
    "durationMs": 840,
    "terms": [
      {
        "term": "phosphorylation",
        "key": "phosphorylation",
        "score": 10,
        "occurrences": 2,
        "context": "Oxidative phosphorylation occurs across the inner membrane…",
        "explanation": { }
      }
    ]
  }
}
```

Only the first `explainCount` terms carry an `explanation`; the rest have
`null` and are looked up individually through `/api/search` when the reader
clicks them. This keeps the first render fast on a long paper.

**Errors:** `text_too_short` (400), `text_too_long` (413),
`rate_limited_extract` (429).

---

## GET /api/health

```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "env": "production",
    "uptimeSeconds": 1420,
    "cache": { "driver": "memory", "healthy": true, "entries": 68 },
    "version": "1.0.0",
    "time": "2026-09-20T10:55:10.317Z"
  }
}
```

Use this as the health check path on Render or Railway.

---

## GET /api/cache-stats

```json
{
  "ok": true,
  "data": {
    "driver": "memory",
    "healthy": true,
    "entries": 68,
    "maxEntries": 2000,
    "ttlSeconds": 86400,
    "staleSeconds": 518400,
    "hits": 240, "staleHits": 12, "misses": 68, "writes": 80, "errors": 0,
    "hitRate": 0.787,
    "inFlight": 0,
    "uptimeSeconds": 1420,
    "recentKeys": ["term:en:apoptosis"]
  }
}
```

`hitRate` counts fresh and stale hits against all lookups. On a warm cache it
settles around 0.8 for normal use.

---

## Rate limits

| Route | Default |
|---|---|
| `/api/search` | 60 requests per minute per IP |
| `/api/extract` | 15 requests per minute per IP |

Standard `RateLimit-*` headers are returned, and a 429 includes `Retry-After`.
Extraction is limited harder because one call fans out into many upstream
requests.

## CORS

Set `ALLOWED_ORIGINS` to your Pages origin in production, for example
`https://your-username.github.io`. A blocked origin gets
`origin_not_allowed` (403). While developing, `*` is fine.
