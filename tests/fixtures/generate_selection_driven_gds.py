"""Real GDS regressions: heuristic hints must not veto user selection."""
from datetime import datetime
from pathlib import Path

import gdstk


library = gdstk.Library(unit=1e-6, precision=1e-9)
cell = library.new_cell("TOP")

# Sparse but legitimate devices: the density heuristic deliberately flags these.
for x, y in [(-20000, -10000), (0, 10000), (20000, -10000)]:
    cell.add(gdstk.rectangle((x - 1000, y - 1000), (x + 1000, y + 1000), layer=10))

# One layer, six independently selectable GDS boundaries: devices A/B and frame C-F.
for p0, p1 in [
    ((-14000, -3000), (-8000, 3000)),  # A
    ((6000, -2000), (10000, 2000)),   # B
    ((-30000, -18000), (30000, -17000)),  # C
    ((-30000, 17000), (30000, 18000)),    # D
    ((-30000, -17000), (-29000, 17000)),  # E
    ((29000, -17000), (30000, 17000)),    # F
]:
    cell.add(gdstk.rectangle(p0, p1, layer=20))

library.write_gds(
    Path(__file__).with_name("selection_driven_patterns.gds"),
    timestamp=datetime(2026, 1, 1),
)
