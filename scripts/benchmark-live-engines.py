from __future__ import annotations

from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_ROOT = REPO_ROOT / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.benchmarks.live_engine_benchmark import main


if __name__ == "__main__":
    raise SystemExit(main())
