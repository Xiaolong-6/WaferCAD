from pathlib import Path

import gdstk


output = Path(__file__).with_name("realistic_pattern_projection.gds")
library = gdstk.Library(unit=1e-6, precision=1e-9)
cell = library.new_cell("TOP")

# A normal filled rectangle must remain a valid process feature.
cell.add(gdstk.rectangle((-24000, -4000), (-16000, 4000), layer=1, datatype=0))

# Four thin boundaries form a reticle/context frame on its own layer.
for p0, p1 in [
    ((-30000, -18000), (30000, -17000)),
    ((-30000, 17000), (30000, 18000)),
    ((-30000, -17000), (-29000, 17000)),
    ((29000, -17000), (30000, 17000)),
]:
    cell.add(gdstk.rectangle(p0, p1, layer=90, datatype=0))

# Four process rectangles compose into one region with an internal hole.
for p0, p1 in [
    ((-8000, -8000), (8000, -4000)),
    ((-8000, 4000), (8000, 8000)),
    ((-8000, -4000), (-4000, 4000)),
    ((4000, -4000), (8000, 4000)),
]:
    cell.add(gdstk.rectangle(p0, p1, layer=2, datatype=0))

# Two disconnected process islands exercise multi-region composition.
cell.add(gdstk.rectangle((16000, -7000), (22000, -1000), layer=3, datatype=0))
cell.add(gdstk.rectangle((20000, 1000), (26000, 7000), layer=3, datatype=0))

library.write_gds(output)
