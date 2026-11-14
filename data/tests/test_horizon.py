import json
from pathlib import Path

import numpy as np
import pytest

from lunarterrain import NoTerrain, Terrain, dems_available, make_mask_json
from lunarterrain.horizon import R_MOON, stereo_xy, unit_vector

MASKS = Path(__file__).resolve().parents[1] / "masks"
needs_dems = pytest.mark.skipif(not dems_available(),
                                reason="DEMs missing; set LUNARNAV_DEM_DIR")


def test_stereo_pole_and_60s():
    x, y = stereo_xy(unit_vector(-89.999999, 0.0))
    assert abs(x) < 1 and abs(y) < 1
    x, y = stereo_xy(unit_vector(-60.0, 0.0))
    assert y == pytest.approx(2 * R_MOON * 0.5 / (1 + np.sin(np.radians(60))))


@pytest.fixture(scope="module")
def terrain():
    with Terrain() as t:
        yield t


@needs_dems
@pytest.mark.parametrize("name", ["shackleton_rim_-89.45_-137.31_h2.json",
                                  "shackleton_floor_-89.67_129.78_h2.json"])
def test_committed_masks_match(terrain, name):
    ref = json.loads((MASKS / name).read_text())
    mask, h = make_mask_json(terrain, ref["lat_deg"], ref["lon_deg"], ref["observer_height_m"])
    assert mask == ref
    assert mask["surface_height_m"] == pytest.approx(h, abs=0.01)


@needs_dems
@pytest.mark.parametrize("lat, lon", [(0.674, 23.473), (-62.0, 0.0)])
def test_no_terrain(terrain, lat, lon):
    with pytest.raises(NoTerrain):
        terrain.horizon_mask(lat, lon, 2.0)
