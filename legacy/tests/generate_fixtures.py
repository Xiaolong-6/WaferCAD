from pathlib import Path

import gdstk


FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


def generate_fixtures(force: bool = False) -> tuple[Path, Path]:
    """Create small, synthetic, layer-aware GDSII and OASIS fixtures."""
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    gds_path = FIXTURE_DIR / "synthetic_two_layer.gds"
    oasis_path = FIXTURE_DIR / "synthetic_two_layer.oas"
    if not force and gds_path.is_file() and oasis_path.is_file():
        return gds_path, oasis_path

    library = gdstk.Library(unit=1e-6, precision=1e-9)

    base = library.new_cell("BASE")
    base.add(gdstk.rectangle((-20, -10), (0, 10), layer=1, datatype=0))
    base.add(gdstk.rectangle((5, -8), (20, 8), layer=10, datatype=5))

    top = library.new_cell("TOP")
    top.add(gdstk.Reference(base, origin=(100, 200)))

    library.write_gds(gds_path)
    library.write_oas(oasis_path)
    return gds_path, oasis_path


if __name__ == "__main__":
    for path in generate_fixtures(force=True):
        print(path)
