"""The backend service must work without a sibling frontend checkout."""
import os
import shutil
import subprocess
import sys
from pathlib import Path


def test_backend_runs_as_an_independent_service(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    service = tmp_path / "standalone-service"
    shutil.copytree(backend / "app", service / "app", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(backend / "data", service / "data")
    env = {**os.environ, "PYTHONPATH": str(service), "VERCEL": "1"}
    env.pop("GEMINI_API_KEY", None)
    result = subprocess.run(
        [sys.executable, "-c", """
from fastapi.testclient import TestClient
from app.main import app, DATA
assert DATA.is_dir()
assert not any(route.path == '/' for route in app.routes)
with TestClient(app) as client:
    catalog = client.get('/api/v1/charms')
    assert catalog.status_code == 200
    assert len(catalog.json()['charms']) >= 36
    result = client.post('/api/v1/bracelets/generate', json={
        'memory': 'drinking matcha in the library with my friend on a rainy day',
        'charm_count': 5,
    })
    assert result.status_code == 200, result.text
    assert client.get('/api/v1/charms/butterfly').status_code == 200
"""],
        cwd=service,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
