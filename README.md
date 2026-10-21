# Semantic Charm Bracelet

One memory in, one bracelet out. FastAPI backend (concept extraction, embeddings, cosine matching, diverse
selection) and a React + TypeScript + Matter.js frontend (chain, charm drop-in, constraints, drag to swing).

## Run it (one server, one URL)

```bash
# 1. Build the frontend (needs Node 18+)
cd frontend && npm install && npm run build && cd ..

# 2. Start the backend (needs Python 3.10+); it also serves the built site
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

Open http://localhost:8000

## Deploy on Vercel

Import this repository as one Vercel project with its Root Directory set to the
repository root. The root `vercel.json` defines two independently built services:

- `backend`: FastAPI in `backend`, entrypoint `app.main:app`, public under `/api/*`.
- `frontend`: Vite in `frontend`, built with `npm ci` and `npm run build`, serving
  `dist` for all other public paths, including `/assets/charms/*`.

API routes keep their `/api/v1/...` prefix. Browser requests use relative URLs
on the deployment's own domain. There are no runtime service-to-service calls,
so no bindings or backend URL environment variables are needed. Vite's localhost
proxy applies only to the separate `npm run dev` development workflow.

The backend reads its catalog and optional embeddings from its own `data/`
directory. On Vercel, it does not mount the sibling frontend build. The frontend
service owns the artwork and other static files.

For a combined local preview, install the [Vercel CLI](https://vercel.com/docs/cli)
and run from the repository root:

```bash
vercel dev -L
```

The `-L` flag runs locally without cloud authentication. Set optional Gemini
settings from `backend/.env.example` in Vercel's project environment variables;
keep API keys out of frontend `VITE_*` variables. Without a Gemini key, the app
uses lexical mode. If using Gemini embeddings, generate them before deployment
and include the resulting files in `backend/data/`.

The current in-memory rate limiter is per Python instance, not a shared limit
across all Vercel instances. Generated bracelets are not persisted.

## Develop with hot reload

```bash
cd backend && uvicorn app.main:app --reload --port 8000     # terminal 1
cd frontend && npm run dev                                   # terminal 2 -> http://localhost:5173
```

## Modes

| Mode | When | Analysis | Matching |
|------|------|----------|----------|
| Lexical (default) | No API key | keyword extraction | word-overlap vectors |
| Gemini | `GEMINI_API_KEY` set and embeddings built | LLM extracts objects, setting, relationships, emotions, atmosphere | Gemini embeddings, cosine similarity |

To enable Gemini:

```bash
cd backend
export GEMINI_API_KEY=your-key
python -m scripts.embed_catalog   # writes data/embeddings.npy + embedding_metadata.json
uvicorn app.main:app --port 8000
```

If the key is set but the embeddings are missing or stale, the server falls back to lexical mode and says so at startup.
Model names are configurable (`GEMINI_LLM_MODEL`, `GEMINI_EMBED_MODEL`, see `.env.example`); check Google's docs if a default is retired.

## API

- `POST /api/v1/bracelets/generate` `{ "memory": "...", "charm_count": 5 }` -> theme + ordered charms with positions
- `GET /api/v1/charms`, `GET /api/v1/charms/{id}`
- Errors: `{ "success": false, "error": { "code", "message" } }` with 422 / 429 / 502 / 500

`match_score` is a cosine similarity, not a probability.

## Add a charm

1. Drop an SVG (64x64 viewBox, jump ring at the top) into `frontend/public/assets/charms/`.
2. Add an entry to `backend/data/charms.json` (unique `id`, `semantic_description`, `asset_url`).
3. Gemini mode only: re-run `python -m scripts.embed_catalog`.

## Tests

```bash
cd backend && pytest
cd frontend && npm run build      # type-checks and builds
```
