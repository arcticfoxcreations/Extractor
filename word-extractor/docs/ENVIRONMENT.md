# Environment setup

## Requirements

- **Node.js 18.17 or newer.** The backend uses the built-in `fetch`, so there
  is no HTTP client dependency. Check with `node -v`.
- No database. Caching defaults to memory.
- No API keys. Every data source used here is public and free.

## Running locally

```bash
git clone https://github.com/your-username/word-extractor.git
cd word-extractor

# Backend
cd backend
npm install
cp .env.example .env
npm run dev          # http://localhost:8080
```

In a second terminal, serve the frontend. Opening `index.html` directly with
`file://` will not work — browsers block `fetch` and the microphone from
file origins.

```bash
cd frontend
python3 -m http.server 3000
# or: npx serve -l 3000
```

Open `http://localhost:3000`. The default API address is
`http://localhost:8080`, so the two connect with no configuration.

Check it end to end by clicking **Use a sample**: the sample abstract should
come back with roughly a dozen terms marked.

## Environment variables

Every variable has a working default, so an empty `.env` runs fine. Set
`USER_AGENT` and `ALLOWED_ORIGINS` before deploying.

### Core

| Variable | Default | What it does |
|---|---|---|
| `NODE_ENV` | `development` | `production` switches logs to JSON. |
| `PORT` | `8080` | Render and Railway inject this. |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info` or `debug`. |
| `USER_AGENT` | placeholder | **Set this.** Wikimedia throttles clients that do not identify themselves with a real contact URL. |

### Security

| Variable | Default | What it does |
|---|---|---|
| `ALLOWED_ORIGINS` | `*` | Comma-separated origins. Set to your Pages URL in production. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window. |
| `RATE_LIMIT_MAX` | `60` | Requests per window for `/search`. |
| `RATE_LIMIT_EXTRACT_MAX` | `15` | Requests per window for `/extract`. |

### Caching

| Variable | Default | What it does |
|---|---|---|
| `CACHE_DRIVER` | `memory` | `memory` or `redis`. Set automatically to `redis` when `REDIS_URL` is present. |
| `REDIS_URL` | empty | e.g. `redis://default:pass@host:6379`. |
| `CACHE_TTL_SECONDS` | `86400` | How long an entry stays fresh. |
| `CACHE_STALE_SECONDS` | `518400` | How long a stale entry may still be served while refreshing. |
| `CACHE_MAX_ENTRIES` | `2000` | Memory cache ceiling before oldest entries are evicted. |

### Upstream sources

| Variable | Default | What it does |
|---|---|---|
| `UPSTREAM_TIMEOUT_MS` | `6000` | Per-request timeout. |
| `UPSTREAM_RETRIES` | `1` | Retries on a failed upstream call. |
| `WIKIPEDIA_LANG` | `en` | Wikipedia language edition. |
| `ENABLE_DICTIONARY` | `true` | Set `false` to skip the dictionary source. |

### Limits

| Variable | Default | What it does |
|---|---|---|
| `MAX_QUERY_LENGTH` | `120` | Longest accepted search term. |
| `MAX_DOCUMENT_CHARS` | `120000` | Longest accepted document. |
| `MAX_EXTRACTED_TERMS` | `60` | Ceiling on terms returned per extraction. |

## Optional: Redis

The memory cache is per-process, so it resets on redeploy and is not shared
between instances. That is fine for one free instance. Add Redis only when you
run more than one.

[Upstash](https://upstash.com) has a free tier that works well here:

```bash
npm install redis          # listed as an optional dependency
```

```
REDIS_URL=redis://default:your-password@your-host.upstash.io:6379
```

If the package is missing or Redis is unreachable at boot, the backend logs a
warning and keeps running on the memory cache rather than crashing.

## Browser support

| Feature | Support |
|---|---|
| Core app | Any modern browser. No build step, no framework. |
| Voice input | Chrome, Edge and Safari. Firefox has no Web Speech API, so the button disables itself with an explanation. |
| Dark mode | Follows the system setting, with a manual override. |

Voice input also needs a secure context: HTTPS, or `http://localhost`.

## Project layout

```
word-extractor/
├── frontend/          # Static site → GitHub Pages
│   ├── index.html
│   ├── css/styles.css
│   ├── js/            # config, store, api, voice, ui, reader, app
│   └── assets/
├── backend/           # Express API → Render or Railway
│   ├── server.js app.js
│   ├── config/ routes/ controllers/ services/
│   ├── middleware/ utils/ cache/
│   └── .env.example
├── worker/            # Same API, ported to Cloudflare Workers
├── docs/              # API, deployment, environment
└── .github/workflows/ # Pages deployment
```
