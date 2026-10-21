import os
os.environ.pop("GEMINI_API_KEY", None)
import numpy as np
from fastapi.testclient import TestClient
from app.bracelet import build_bracelet
from app.main import app


def test_generate_full_bracelet():
    with TestClient(app) as c:
        r = c.post("/api/v1/bracelets/generate", json={"memory": "Drinking matcha in the library with my best friend on a rainy afternoon", "charm_count": 5})
        assert r.status_code == 200
        charms = r.json()["charms"]
        assert 3 <= len(charms) <= 5
        assert len({x["id"] for x in charms}) == len(charms)
        assert [x["position"] for x in charms] == list(range(len(charms)))
        assert {"matcha", "book", "cloud", "heart"} <= {x["id"] for x in charms}


def test_validation_and_no_match():
    with TestClient(app) as c:
        assert c.post("/api/v1/bracelets/generate", json={"memory": "   "}).status_code == 422
        assert c.post("/api/v1/bracelets/generate", json={"memory": "x" * 401}).status_code == 422
        assert c.post("/api/v1/bracelets/generate", json={"memory": "hello", "charm_count": 9}).status_code == 422
        r = c.post("/api/v1/bracelets/generate", json={"memory": "qwerty zzzz"})
        assert r.status_code == 422 and r.json()["error"]["code"] == "no_matches"


def test_charm_endpoints():
    with TestClient(app) as c:
        catalog = c.get("/api/v1/charms").json()["charms"]
        assert len(catalog) >= 36
        assert {"butterfly", "strawberry", "cherry", "shell", "key", "bow", "tennis", "palette", "icecream", "boot", "clover", "planet"} <= {item["id"] for item in catalog}
        assert c.get("/api/v1/charms/book").status_code == 200
        assert c.get("/api/v1/charms/nope").status_code == 404


def test_new_charms_match_memories():
    with TestClient(app) as c:
        r = c.post("/api/v1/bracelets/generate", json={"memory": "Playing tennis then painting in the studio with butterflies outside", "charm_count": 5})
        assert r.status_code == 200
        assert {"tennis", "palette", "butterfly"} <= {item["id"] for item in r.json()["charms"]}


def test_cosine_ranking():
    charms = [{"id": "a", "name": "A", "asset_url": "/a.svg", "physics": {}}, {"id": "b", "name": "B", "asset_url": "/b.svg", "physics": {}}]
    cv = np.array([[1, 0], [0, 1]], dtype=np.float32)
    out = build_bracelet(["x"], None, charms, cv, np.array([[0.1, 0.99]], dtype=np.float32), 3, 0.5)
    assert [c.id for c in out.charms] == ["b"]
