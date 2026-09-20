# Word Extractor

Paste a research paper. The hard words explain themselves.

Reading an unfamiliar paper means stopping every other sentence to look
something up, and every lookup costs you your place in the text. Word Extractor
finds the terms in a passage that are actually worth explaining, marks them in
place, and puts a plain-language gloss beside the text instead of on top of it.

Explanations are assembled from Wikipedia, Wikidata and the Free Dictionary
API. No API keys, no paid services, no accounts.

## What it does

**Read a paper.** Paste an abstract or a whole section — or attach a
`.txt`, `.md`, `.pdf`, `.docx`, `.xlsx`, `.xls` or `.pptx` file and its text
is pulled out and dropped into the box for you (the file itself is never
stored; it's parsed in memory and discarded). The backend scores every word
for difficulty and marks the ones a reader is likely to stumble on. Click a
marked word and its explanation opens in the margin. The eight hardest
terms are explained up front so the first click is instant.

**Look up one word.** Type or dictate a single term and the gloss opens on
its own a moment after you stop typing — pressing Explain still works too.

**Dictate instead of typing.** Voice input runs on the Web Speech API with live
interim results, so the field fills in as you speak. Dictation appends to what
is already there rather than replacing it, and a dictated single word searches
itself as soon as you stop. Firefox has no Web Speech API, so the button
disables itself and explains why.

The gloss gives a short definition, a pronunciation with a 🔊 play button
when the dictionary has audio for it, key facts, a summary, related terms
you can jump to, categories, source links, and when the source was last
edited.

## How difficulty is decided

A word is worth explaining if a reader is likely to trip on it, which is not
the same as "long". The scorer combines word length, syllable count, technical
prefixes and suffixes (`-osis`, `-ase`, `cyto-`, `chemo-`), how often the word
appears, and a list of roughly 900 common words that includes academic
scaffolding like *analysis*, *significant* and *results*.

Inflections are folded back to their stems, so *establishes* is recognised as
common even though only *established* is on the list. On a cell-biology
abstract this surfaces `phosphorylation`, `chemiosmotic`, `apoptosis`,
`eukaryotic` and `organelle`, while ignoring `results`, `data`, `pattern` and
`significant`.

Acronyms get their own rule: any unknown 2–8 letter capitalised token scores as
difficult, because `ATP` needs a gloss even though it is three characters long.

## Architecture

```
Browser                    Backend                     Public sources
───────                    ───────                     ──────────────
index.html                 POST /api/extract  ──┐
  ├─ reader.js  ──────────▶  scores every word  │
  ├─ voice.js                                   ├──▶ Wikipedia REST + action API
  ├─ api.js     ──────────▶ GET /api/search  ───┤    Wikidata entities
  └─ ui.js                   cache → sources    ├──▶ Free Dictionary API
                                                │
GitHub Pages               Render / Railway / Cloudflare
```

Performance comes from three places:

- **Parallel fetching.** Independent sources are requested together and settled
  independently, so a dead Wikidata lookup never delays or breaks a good
  Wikipedia summary.
- **Stale-while-revalidate caching.** An expired entry is served immediately
  while a fresh copy is fetched in the background, so a cache expiry never
  costs the reader latency.
- **Request collapsing.** Identical concurrent lookups share one upstream call
  instead of racing each other.

There are three cache layers: a per-session cache in the browser, the server
cache (memory by default, Redis when `REDIS_URL` is set), and `Cache-Control`
headers so browsers and CDNs can reuse responses too.

## Quick start

```bash
cd backend && npm install && cp .env.example .env && npm run dev
```

```bash
cd frontend && python3 -m http.server 3000
```

Open `http://localhost:3000` and click **Use a sample**.

Serve the frontend over HTTP rather than opening the file directly — browsers
block `fetch` and the microphone on `file://` origins.

Full setup notes are in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## API

| Route | Purpose |
|---|---|
| `GET /api/search?q=term` | Explain one term |
| `POST /api/extract` | Find and explain the hard terms in a passage |
| `GET /api/health` | Service health |
| `GET /api/cache-stats` | Cache counters and hit rate |

Every route also works without the `/api` prefix. Full reference with request
and response shapes: [docs/API.md](docs/API.md).

## Deployment

Frontend goes to GitHub Pages; a workflow in `.github/workflows/pages.yml`
publishes `frontend/` on every push to `main`.

The backend runs anywhere Node runs. `worker/` holds a second implementation of
the same API ported to Cloudflare Workers, which has no Node runtime — same
routes, same response shapes, KV instead of Redis.

Step-by-step instructions for Render, Railway and Cloudflare, plus CORS setup
and troubleshooting: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security

- `helmet` security headers, CORS restricted by origin in production
- Rate limiting per IP, tighter on `/extract` since one call fans out into many
- Every input validated for type, length and character set before use
- No `innerHTML` anywhere in the frontend. Paper text and API responses are
  written as text nodes, so a document containing `<img onerror=…>` renders as
  visible characters rather than executing
- Errors return a generic message publicly and log the detail server-side
- No secrets in the frontend, because there are none to keep
- File uploads are restricted to an explicit document allow-list (no
  executables, no images), capped at 15 MB, parsed entirely in memory and
  never written to disk

## Project layout

```
frontend/   Static site: HTML, CSS, vanilla JS in seven small modules
backend/    Express API: routes → controllers → services → sources
worker/     The same API on Cloudflare Workers
docs/       API reference, deployment guide, environment guide
```

## Limits worth knowing

- Wikipedia is an encyclopaedia, not a domain glossary. A very new or very
  narrow term may come back with `found: false`. The response says so rather
  than inventing an answer.
- Difficulty scoring is heuristic, not a language model. It is tuned for
  scientific English and will occasionally mark a word you already knew.
- Render's free tier sleeps after 15 minutes idle, so the first request after a
  nap is slow. Cloudflare Workers do not sleep.

## Licence

MIT.

Content comes from Wikipedia and Wikidata (CC BY-SA) and Wiktionary via the
Free Dictionary API. Check the linked source before citing anything.
