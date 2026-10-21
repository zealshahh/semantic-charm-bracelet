"""Embedding providers. Both return L2-normalised float32 matrices, so cosine == dot."""
import re

import httpx
import numpy as np

from .errors import ProviderError

STOP = set("a an the and or but of in on at to for with my our your his her their its i we you they it me us was were is are be been this that from by as so then than too very just about into over after before while during when where who what had have has do did not no up down out off".split())


def stem(w: str) -> str:
    if len(w) > 4:
        for s in ("ing", "ed", "s"):
            if w.endswith(s) and len(w) - len(s) >= 3:
                return w[: -len(s)]
    return w


def tokens(text: str) -> list[str]:
    return [stem(w) for w in re.findall(r"[a-z]+", text.lower().replace("'", "")) if w not in STOP]


def _normalise(m: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(m, axis=1, keepdims=True)
    return (m / np.where(n == 0, 1, n)).astype(np.float32)


class LexicalEmbedder:
    """Offline fallback: bag-of-stems over the catalog vocabulary."""
    name = "lexical-v1"
    default_min_score = 0.2

    def __init__(self, docs: list[str]):
        self.vocab = {w: i for i, w in enumerate(sorted({t for d in docs for t in tokens(d)}))}

    def embed(self, texts: list[str], task: str = "query") -> np.ndarray:
        m = np.zeros((len(texts), len(self.vocab)), dtype=np.float32)
        for r, t in enumerate(texts):
            for w in set(tokens(t)):
                if w in self.vocab:
                    m[r, self.vocab[w]] = 1
        return _normalise(m)


class GeminiEmbedder:
    default_min_score = 0.5

    def __init__(self, api_key: str, model: str, timeout: float = 15.0):
        self.key, self.model, self.timeout = api_key, model, timeout
        self.name = model

    def embed(self, texts: list[str], task: str = "query") -> np.ndarray:
        task_type = "RETRIEVAL_QUERY" if task == "query" else "RETRIEVAL_DOCUMENT"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:batchEmbedContents"
        body = {"requests": [{"model": f"models/{self.model}", "taskType": task_type,
                              "content": {"parts": [{"text": t}]}} for t in texts]}
        out: list[list[float]] = []
        for attempt in range(2):  # one bounded retry
            try:
                r = httpx.post(url, json=body, headers={"x-goog-api-key": self.key}, timeout=self.timeout)
                if r.status_code == 429:
                    raise ProviderError("embedding provider rate limit")
                r.raise_for_status()
                out = [e["values"] for e in r.json()["embeddings"]]
                break
            except (httpx.HTTPError, KeyError, ValueError) as e:
                if attempt == 1:
                    raise ProviderError(f"embedding provider failed: {type(e).__name__}") from e
        return _normalise(np.array(out, dtype=np.float32))
