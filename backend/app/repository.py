import json
from pathlib import Path


class CharmRepository:
    def __init__(self, data_dir: Path, assets_dir: Path | None = None):
        self.charms: list[dict] = json.loads((data_dir / "charms.json").read_text())
        ids = [c["id"] for c in self.charms]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate charm ids in charms.json")
        if assets_dir and assets_dir.exists():
            for c in self.charms:
                if not (assets_dir / Path(c["asset_url"]).name).exists():
                    raise ValueError(f"missing asset for {c['id']}: {c['asset_url']}")
        self.by_id = {c["id"]: c for c in self.charms}

    def public(self, c: dict) -> dict:
        return {k: c[k] for k in ("id", "name", "description", "category", "asset_url")}
