"""SPICE kernel list and loading."""

from __future__ import annotations

import os
from pathlib import Path

import spiceypy as sp

# Paths relative to https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
KERNELS = [
    "lsk/naif0012.tls",
    "pck/pck00011.tpc",
    "spk/planets/de440s.bsp",
    "pck/moon_pa_de440_200625.bpc",
    "fk/satellites/moon_de440_250416.tf",
]

KERNEL_DIR = Path(
    os.environ.get("LUNARNAV_KERNELS", Path(__file__).resolve().parents[2] / "kernels")
)
META_KERNEL = KERNEL_DIR / "lunarnav.tm"

_loaded = False


def _spice_string(s: str, n: int = 60) -> str:
    """Quote a long string as SPICE text-kernel pieces joined by the '+' continuation."""
    parts = [s[i : i + n] for i in range(0, len(s), n)]
    return ",\n          ".join(f"'{p}+'" for p in parts[:-1]) + ("," if parts[:-1] else "") + (
        "\n          " if parts[:-1] else ""
    ) + f"'{parts[-1]}'"


def write_meta_kernel() -> Path:
    """Write kernels/lunarnav.tm for use with other SPICE tools.

    lunarnav itself loads the kernel files one by one (see ensure_loaded).
    """
    names = "\n".join(f"        '$K/{Path(k).name}'" for k in KERNELS)
    META_KERNEL.write_text(
        "KPL/MK\n\nlunarnav meta-kernel (written by scripts/get_kernels.py)\n\n"
        "\\begindata\n"
        "    PATH_SYMBOLS = ( 'K' )\n"
        f"    PATH_VALUES  = ( {_spice_string(str(KERNEL_DIR.resolve()))} )\n"
        f"    KERNELS_TO_LOAD = (\n{names}\n    )\n"
        "\\begintext\n"
    )
    return META_KERNEL


def ensure_loaded() -> None:
    """Load the kernels once per process."""
    global _loaded
    if _loaded:
        return
    missing = [k for k in KERNELS if not (KERNEL_DIR / Path(k).name).exists()]
    if missing:
        raise FileNotFoundError(
            f"SPICE kernels missing in {KERNEL_DIR}: {missing}. "
            "Run: uv run python scripts/get_kernels.py"
        )
    for k in KERNELS:
        sp.furnsh(str(KERNEL_DIR / Path(k).name))
    _loaded = True
