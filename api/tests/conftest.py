from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from lunarnav.spice import KERNEL_DIR, KERNELS

kernels_missing = [k for k in KERNELS if not (KERNEL_DIR / Path(k).name).exists()]
needs_kernels = pytest.mark.skipif(
    bool(kernels_missing),
    reason="SPICE kernels missing; run: uv run python scripts/get_kernels.py in core/",
)


@pytest.fixture(scope="module")
def client():
    from lunarnav_api.main import app

    with TestClient(app) as c:  # runs the lifespan, which loads the kernels
        yield c
