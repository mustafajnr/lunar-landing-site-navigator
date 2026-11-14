"""CLI wrapper. The code is in the package lunarterrain (src/lunarterrain/horizon.py).

    uv run python horizon.py LAT LON [--height 2.0] [-o out.json]
"""

from lunarterrain.horizon import main

if __name__ == "__main__":
    main()
