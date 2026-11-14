"""Download the SPICE kernels for lunarnav into core/kernels/ and write a meta-kernel.

Usage (from core/):  uv run python scripts/get_kernels.py

Some systems do not trust the root CA of naif.jpl.nasa.gov (Sectigo R46).
If the `certifi` package is installed, its CA bundle is used. TLS checks stay on.
"""

from __future__ import annotations

import ssl
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from lunarnav.spice import KERNEL_DIR, KERNELS, META_KERNEL, write_meta_kernel  # noqa: E402

BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"


def ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def main() -> None:
    KERNEL_DIR.mkdir(parents=True, exist_ok=True)
    ctx = ssl_context()
    for rel in KERNELS:
        dest = KERNEL_DIR / Path(rel).name
        if dest.exists() and dest.stat().st_size > 0:
            print(f"have  {dest.name}")
            continue
        url = BASE + rel
        print(f"get   {url}")
        tmp = dest.with_suffix(dest.suffix + ".part")
        with urllib.request.urlopen(url, context=ctx) as r, open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        tmp.rename(dest)
    write_meta_kernel()
    print(f"wrote {META_KERNEL}")


if __name__ == "__main__":
    main()
