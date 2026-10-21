"""Precompute catalog embeddings with Gemini. Run from backend/: python -m scripts.embed_catalog"""
import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.embeddings import GeminiEmbedder  # noqa: E402

data = Path(__file__).resolve().parents[1] / "data"
charms = json.loads((data / "charms.json").read_text())
model = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")
key = os.environ["GEMINI_API_KEY"]
vecs = GeminiEmbedder(key, model).embed([f"{c['name']}: {c['semantic_description']}" for c in charms], "document")
np.save(data / "embeddings.npy", vecs)
(data / "embedding_metadata.json").write_text(json.dumps(
    {"model": model, "dim": int(vecs.shape[1]), "ids": [c["id"] for c in charms]}, indent=2))
print(f"Wrote {vecs.shape[0]} vectors of dim {vecs.shape[1]} ({model})")
