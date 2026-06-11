import asyncio
import os

# Must be set before any app module is imported
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("FOOTBALL_DATA_API_KEY", "test_key")

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from main import app
from database import Base, get_db
from models import Team

_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


def _run(coro):
    """Run a coroutine in a throwaway event loop (used outside TestClient context)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture()
def db_setup():
    """Creates the test DB engine and session factory, seeds 48 teams, and yields
    the session factory so tests can use it directly (e.g. to monkeypatch
    module-level session factories that bypass FastAPI's dependency injection)."""
    engine = create_async_engine(
        _TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with session_factory() as session:
            session.add_all([
                Team(id=i, name=f"Team {i}", group="A", crest_url=None, external_id=i)
                for i in range(1, 49)
            ])
            await session.commit()

    _run(_setup())
    yield session_factory
    _run(engine.dispose())


@pytest.fixture()
def client(db_setup):
    session_factory = db_setup

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
