# Deployment guide

The frontend is static and the backend is a small stateless API, so the whole
project runs on free tiers. Deploy the backend first — you need its URL to
configure the frontend.

---

## 1. Backend

Pick one host. Render is the easiest; Cloudflare is the fastest.

### Render

1. Push this repository to GitHub.
2. On [render.com](https://render.com), choose **New → Web Service** and connect the repo.
3. Configure:

   | Setting | Value |
   |---|---|
   | Root directory | `backend` |
   | Runtime | Node |
   | Build command | `npm install` |
   | Start command | `npm start` |
   | Health check path | `/api/health` |
   | Instance type | Free |

4. Add environment variables (**Environment** tab):

   ```
   NODE_ENV=production
   USER_AGENT=WordExtractor/1.0 (https://github.com/you/word-extractor; you@example.com)
   ALLOWED_ORIGINS=https://your-username.github.io
   ```

5. Deploy, then confirm: `curl https://your-service.onrender.com/api/health`

**The free tier sleeps after 15 minutes of inactivity**, so the first request
after a nap takes 30–50 seconds. For a hackathon demo, hit the health endpoint
a minute before you present, or keep it warm with a free
[cron-job.org](https://cron-job.org) ping every 10 minutes.

### Railway

1. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**.
2. Under **Settings → Source**, set the root directory to `backend`.
3. Railway detects Node and runs `npm start` automatically. Leave `PORT` alone —
   it is injected, and `config/index.js` reads it.
4. Add the same environment variables as above.
5. Under **Settings → Networking**, click **Generate Domain**.

Railway gives a monthly usage credit rather than a sleeping instance, so
responses stay fast. Watch the credit if you leave it running for weeks.

### Cloudflare Workers

The Worker in `worker/` is a separate implementation of the same API — same
routes, same response shapes — ported to the Workers runtime, which has no
Node APIs. It runs at the edge and does not sleep.

```bash
cd worker
npm install
npx wrangler login

# Create the KV namespace that caches looked-up terms
npx wrangler kv namespace create WORD_CACHE
# Copy the printed id into wrangler.toml under [[kv_namespaces]]

npx wrangler deploy
```

Then set your origin:

```bash
npx wrangler secret put ALLOWED_ORIGINS
# or edit [vars] in wrangler.toml for non-secret values
```

The free plan covers 100,000 requests and 1,000 KV writes per day, which is far
more than a demo needs.

---

## 2. Frontend on GitHub Pages

Two options. The workflow is better because it republishes on every push.

### Using the included workflow

`.github/workflows/pages.yml` is already committed. In your repository:

**Settings → Pages → Source → GitHub Actions**

Push to `main` and the `frontend/` folder publishes to
`https://your-username.github.io/word-extractor/`.

### Using a branch

**Settings → Pages → Source → Deploy from a branch**, then pick `main` and the
`/frontend` folder. No workflow needed, but you must push to redeploy.

### Point the frontend at your backend

The frontend must know where the API lives. Either:

- **Edit the default.** In `frontend/js/config.js`, change `DEFAULT_API` to
  your backend URL and commit. Best for a shared demo, since visitors need no
  setup.
- **Set it in the browser.** Open the deployed page, click **Backend**, paste
  the URL, then **Save** and **Test**. It is stored in `localStorage` for that
  browser only — useful for testing against a local backend without committing
  anything.

---

## 3. Connect the two

Set `ALLOWED_ORIGINS` on the backend to your exact Pages origin, with no
trailing slash and no path:

```
ALLOWED_ORIGINS=https://your-username.github.io
```

Redeploy the backend after changing it.

---

## Verifying the deployment

```bash
# 1. Backend is alive
curl https://your-backend/api/health

# 2. A real lookup works
curl "https://your-backend/api/search?q=photosynthesis"

# 3. CORS allows your Pages origin — look for access-control-allow-origin
curl -I -H "Origin: https://your-username.github.io" \
  "https://your-backend/api/search?q=test"
```

Then open the Pages URL, click **Use a sample**, and confirm the terms get
marked and a gloss opens.

---

## Troubleshooting

**"Could not reach the backend."** Either the backend is asleep (wait a minute
on Render's free tier and retry) or CORS is rejecting you. Open the browser
console: a CORS failure says so explicitly. Fix `ALLOWED_ORIGINS` and redeploy.

**Lookups return `found: false` for everything.** Wikimedia is blocking your
`User-Agent`. Set a real `USER_AGENT` with a working contact URL — the default
placeholder gets throttled.

**The microphone button is disabled.** The browser has no Web Speech API.
Firefox does not ship it; Chrome, Edge and Safari do. Typing still works.

**The microphone does nothing on the deployed site.** Speech recognition
requires a secure context. GitHub Pages is HTTPS, so this only bites on a
custom domain served over plain HTTP, or on `file://`. Serve locally over
`http://localhost`, which browsers treat as secure.

**429 responses during a demo.** Raise `RATE_LIMIT_MAX` and
`RATE_LIMIT_EXTRACT_MAX`, or reduce `explainCount` in the extract request.
