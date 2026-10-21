import json
from dataclasses import dataclass

import httpx

from .embeddings import STOP
from .errors import ProviderError

KINDS = ["objects", "setting", "relationships", "emotions", "atmosphere"]
PROMPT = """Extract concepts from this memory for choosing charm illustrations. Only use details
supported by the text; do not invent events. Reply with JSON only:
{{"objects":[],"setting":[],"relationships":[],"emotions":[],"atmosphere":[],"theme":"2-4 word title"}}
Each list holds short words or phrases (max 4 items). Memory: {memory}"""


@dataclass
class Analysis:
    concepts: list[str]  # ordered by priority, interleaved across kinds for coverage
    theme: str | None = None


def keyword_analysis(memory: str) -> Analysis:
    seen, out = set(), []
    for w in memory.lower().replace("'", "").replace(",", " ").replace(".", " ").split():
        w = "".join(ch for ch in w if ch.isalpha())
        if len(w) >= 3 and w not in STOP and w not in seen:
            seen.add(w)
            out.append(w)
    return Analysis(out)


def _validate(data: dict) -> Analysis:
    if not isinstance(data, dict):
        raise ValueError("not an object")
    lists = []
    for k in KINDS:
        v = data.get(k, [])
        if not isinstance(v, list):
            raise ValueError(f"{k} is not a list")
        lists.append([s.strip()[:40] for s in v if isinstance(s, str) and s.strip()][:4])
    concepts, seen = [], set()
    for i in range(4):  # interleave: first of each kind, then second of each...
        for lst in lists:
            if i < len(lst) and lst[i].lower() not in seen:
                seen.add(lst[i].lower())
                concepts.append(lst[i])
    if not concepts:
        raise ValueError("no concepts")
    theme = data.get("theme")
    return Analysis(concepts[:12], theme.strip()[:60] if isinstance(theme, str) and theme.strip() else None)


def analyze(memory: str, api_key: str | None, model: str, timeout: float = 20.0) -> Analysis:
    if not api_key:
        return keyword_analysis(memory)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {"contents": [{"parts": [{"text": PROMPT.format(memory=json.dumps(memory))}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}
    try:
        r = httpx.post(url, json=body, headers={"x-goog-api-key": api_key}, timeout=timeout)
        if r.status_code == 429:
            raise ProviderError("analysis provider rate limit")
        r.raise_for_status()
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        return _validate(json.loads(text.strip().removeprefix("```json").removesuffix("```")))
    except ProviderError:
        raise
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        return keyword_analysis(memory)  # malformed/unavailable output: degrade, don't fail
