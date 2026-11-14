# Lunar Landing Site Navigator API, for Google Cloud Run.
# Build context is the repository root (the image needs core/ and data/):
#   docker build -f api/Dockerfile -t lunarnav-api .
#   docker run --rm -p 8080:8080 lunarnav-api
FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /usr/local/bin/uv

# The rasterio wheel (lunarterrain) needs libexpat, which python:slim does not have.
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    PATH="/app/api/.venv/bin:$PATH" \
    LUNARNAV_KERNELS=/app/kernels \
    LUNARNAV_SITES=/app/data/sites.json \
    LUNARNAV_MASK_CACHE=/app/data/cache/masks \
    LUNARNAV_DEM_DIR=/dem \
    PORT=8080

WORKDIR /app/api

# 1. Third-party dependencies only (cached until a lock file changes).
COPY core/pyproject.toml core/uv.lock /app/core/
COPY data/pyproject.toml data/uv.lock /app/data/
COPY api/pyproject.toml api/uv.lock /app/api/
RUN uv sync --frozen --no-dev --no-install-project \
        --no-install-package lunarnav --no-install-package lunarterrain

# 2. Core package and SPICE kernels. certifi gives a CA bundle that has the
#    Sectigo R46 root used by naif.jpl.nasa.gov; TLS checks stay on.
COPY core/src /app/core/src
COPY core/scripts/get_kernels.py /app/core/scripts/get_kernels.py
RUN uv run --frozen --no-dev --no-sync --with certifi \
        python /app/core/scripts/get_kernels.py \
    && rm -f /app/kernels/*.part

# 3. API package. uv builds lunarnav here, and its pyproject.toml names README.md.
COPY core/README.md /app/core/README.md
COPY data/src /app/data/src
COPY api/src /app/api/src
RUN uv sync --frozen --no-dev

# 4. Site list (CONTRACTS.md section 7), read through LUNARNAV_SITES.
COPY data/sites.json /app/data/sites.json

# 5. Precomputed terrain masks (curated sites, 0, 2 and 10 m), read through
#    LUNARNAV_MASK_CACHE. The DEMs are not in the image. If a volume gives
#    them at /dem (LUNARNAV_DEM_DIR), the API also calculates new masks.
COPY data/masks/precomputed /app/data/cache/masks

RUN useradd --system --no-create-home app
USER app

EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn lunarnav_api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
