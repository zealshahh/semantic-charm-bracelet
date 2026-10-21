import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .analyzer import analyze
from .bracelet import build_bracelet
from .embeddings import GeminiEmbedder, LexicalEmbedder
from .errors import ApiError, ProviderError
from .repository import CharmRepository
from .schemas import BraceletOut, GenerateRequest

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "backend" / "data"
ASSETS = ROOT / "frontend" / "public" / "assets" / "charms"
DIST = ROOT / "frontend" / "dist"


def load_engine():
    repo = CharmRepository(DATA, ASSETS)
    docs = [c["semantic_description"] for c in repo.charms]
    key = os.getenv("GEMINI_API_KEY") or None
    embedder, vecs = LexicalEmbedder(docs), None
    emb_file, meta_file = DATA / "embeddings.npy", DATA / "embedding_metadata.json"
    if key and emb_file.exists() and meta_file.exists():
        import json
        meta = json.loads(meta_file.read_text())
        model = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")
        arr = np.load(emb_file)
        if meta.get("ids") == [c["id"] for c in repo.charms] and meta.get("model") == model \
                and arr.shape == (len(repo.charms), meta.get("dim")):
            embedder, vecs = GeminiEmbedder(key, model), arr.astype(np.float32)
        else:
            print("embeddings.npy is stale; falling back to lexical mode. Re-run scripts/embed_catalog.py")
    if vecs is None:
        vecs = embedder.embed(docs, "document")
    min_score = float(os.getenv("MIN_SCORE") or embedder.default_min_score)
    return repo, embedder, vecs, key, min_score


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.engine = load_engine()
    print(f"Mode: {app.state.engine[1].name}")
    yield


app = FastAPI(title="Semantic Charm Bracelet", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
                   allow_methods=["GET", "POST"], allow_headers=["*"])
_hits: dict[str, deque] = defaultdict(deque)


def envelope(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"success": False, "error": {"code": code, "message": message}}, status_code=status)


@app.exception_handler(ApiError)
async def _api(_: Request, e: ApiError):
    return envelope(e.status, e.code, e.message)


@app.exception_handler(RequestValidationError)
async def _val(_: Request, e: RequestValidationError):
    return envelope(422, "invalid_request", "Enter a memory of 1-400 characters and a charm count from 3 to 7.")


@app.exception_handler(Exception)
async def _any(_: Request, e: Exception):
    return envelope(500, "internal_error", "Unexpected error while building the bracelet.")  # no stack traces


def rate_limit(request: Request) -> None:
    limit = int(os.getenv("RATE_LIMIT_PER_MIN", "20"))
    q, now = _hits[request.client.host if request.client else "?"], time.time()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
        raise ApiError(429, "rate_limited", "Too many requests. Wait a minute and try again.")
    q.append(now)


@app.post("/api/v1/bracelets/generate", response_model=BraceletOut)
def generate(req: GenerateRequest, request: Request):
    rate_limit(request)
    repo, embedder, vecs, key, min_score = request.app.state.engine
    try:
        a = analyze(req.memory, key, os.getenv("GEMINI_LLM_MODEL", "gemini-2.5-flash"))
        q = embedder.embed(a.concepts, "query")
    except ProviderError as e:
        msg = str(e)
        raise ApiError(429 if "rate limit" in msg else 502, "provider_error", "The AI provider is unavailable. Try again shortly.")
    result = build_bracelet(a.concepts, a.theme, repo.charms, vecs, q, req.charm_count, min_score)
    if result is None:
        raise ApiError(422, "no_matches", "No charms matched. Add details such as objects, places, weather or people.")
    return result


@app.get("/api/v1/charms")
def list_charms(request: Request):
    repo = request.app.state.engine[0]
    return {"success": True, "charms": [repo.public(c) for c in repo.charms]}


@app.get("/api/v1/charms/{charm_id}")
def get_charm(charm_id: str, request: Request):
    repo = request.app.state.engine[0]
    if charm_id not in repo.by_id:
        raise ApiError(404, "not_found", "Charm not found.")
    return {"success": True, "charm": repo.public(repo.by_id[charm_id])}


# Production: serve the built frontend from the same server (run `npm run build` first).
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
