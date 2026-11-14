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


def is_loaded() -> bool:
    """True if lunarnav loaded its kernels and SPICE still has them.

    spiceypy.kclear() (or another unload) outside lunarnav makes this False.
    """
    return _loaded and sp.ktotal("ALL") >= len(KERNELS)


def ensure_loaded() -> None:
    """Load the kernels if they are not loaded.

    This is cheap after the first call. If SPICE lost the kernels, for example after
    spiceypy.kclear(), this function loads them again.
    """
    global _loaded
    if is_loaded():
        return
    _loaded = False
    missing = [k for k in KERNELS if not (KERNEL_DIR / Path(k).name).exists()]
    if missing:
        raise FileNotFoundError(
            f"SPICE kernels missing in {KERNEL_DIR}: {missing}. "
            "Run: uv run python scripts/get_kernels.py"
        )
    for k in KERNELS:
        sp.furnsh(str(KERNEL_DIR / Path(k).name))
    _loaded = True


def reload() -> None:
    """Unload the lunarnav kernels and load them again. Other kernels stay loaded."""
    global _loaded
    for k in KERNELS:
        sp.unload(str(KERNEL_DIR / Path(k).name))  # no effect if the file is not loaded
    _loaded = False
    ensure_loaded()
