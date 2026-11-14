from pathlib import Path

import pytest

from lunarnav.spice import KERNEL_DIR, KERNELS

kernels_missing = [k for k in KERNELS if not (KERNEL_DIR / Path(k).name).exists()]

needs_kernels = pytest.mark.skipif(
    bool(kernels_missing),
    reason="SPICE kernels missing; run: uv run python scripts/get_kernels.py",
)
