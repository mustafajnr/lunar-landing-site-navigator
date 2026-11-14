"""Time one evaluate() call and 720 calls (30 days at 1-hour steps).

Usage (from core/):  uv run python scripts/benchmark.py
"""

import time
from datetime import datetime, timedelta, timezone

from lunarnav import evaluate
from lunarnav.spice import ensure_loaded

LAT, LON = -89.45, -137.3
T0 = datetime(2026, 11, 14, tzinfo=timezone.utc)

t = time.perf_counter()
ensure_loaded()
print(f"kernel load      : {(time.perf_counter() - t) * 1e3:8.2f} ms (once per process)")

t = time.perf_counter()
evaluate(LAT, LON, T0, 2.0)
print(f"first call       : {(time.perf_counter() - t) * 1e3:8.2f} ms")

n = 200
t = time.perf_counter()
for _ in range(n):
    evaluate(LAT, LON, T0, 2.0)
print(f"one call (warm)  : {(time.perf_counter() - t) / n * 1e3:8.3f} ms")

times = [(T0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in range(720)]
t = time.perf_counter()
for u in times:
    evaluate(LAT, LON, u, 2.0)
print(f"720 calls (ISO)  : {(time.perf_counter() - t) * 1e3:8.1f} ms")
