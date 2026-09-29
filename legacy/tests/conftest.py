from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import app
from tests.generate_fixtures import generate_fixtures


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="session")
def layout_fixtures() -> tuple[Path, Path]:
    return generate_fixtures()
