import uuid

import numpy as np

from .schemas import BraceletOut, CharmOut, Physics

NEAR_DUPLICATE = 0.92  # charm-to-charm cosine above which two charms look redundant


def build_bracelet(concepts: list[str], theme: str | None, charms: list[dict], charm_vecs: np.ndarray,
                   concept_vecs: np.ndarray, count: int, min_score: float) -> BraceletOut | None:
    sims = concept_vecs @ charm_vecs.T  # (concepts, charms) cosine similarities
    chosen: list[tuple[int, int, float]] = []  # (concept idx, charm idx, score)
    used: set[int] = set()

    def ok(j: int) -> bool:
        return j not in used and all(float(charm_vecs[j] @ charm_vecs[k]) < NEAR_DUPLICATE for k in used)

    def take(i: int, j: int) -> None:
        chosen.append((i, j, float(sims[i, j])))
        used.add(j)

    # Pass 1 (coverage): best unused charm for each concept, in priority order.
    for i in range(len(concepts)):
        if len(chosen) >= count:
            break
        for j in np.argsort(-sims[i]):
            if sims[i, j] < min_score:
                break
            if ok(int(j)):
                take(i, int(j))
                break
    # Pass 2 (fill): strongest remaining concept/charm pairs.
    if len(chosen) < count:
        pairs = sorted(((float(sims[i, j]), i, j) for i in range(len(concepts)) for j in range(len(charms))
                        if sims[i, j] >= min_score), reverse=True)
        for _, i, j in pairs:
            if len(chosen) >= count:
                break
            if ok(j):
                take(i, j)
    if not chosen:
        return None
    chosen.sort(key=lambda t: t[0])  # keep memory/concept order around the chain
    out = []
    for pos, (i, j, s) in enumerate(chosen):
        c = charms[j]
        out.append(CharmOut(id=c["id"], name=c["name"], concept=concepts[i], asset_url=c["asset_url"],
                            match_score=round(s, 3), position=pos, physics=Physics(**c["physics"])))
    title = theme or ", ".join(o.concept for o in out[:3]).capitalize()
    return BraceletOut(bracelet_id="b_" + uuid.uuid4().hex[:10], theme=title, charms=out)
