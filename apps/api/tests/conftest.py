from collections.abc import AsyncGenerator, Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth import Role, issue_token
from app.db.models import Base
from app.db.session import get_db_session
from app.main import app


@pytest.fixture
def operator_token() -> str:
    return issue_token(role=Role.OPERATOR, subject="test-operator")["access_token"]


@pytest.fixture
def observer_token() -> str:
    return issue_token(role=Role.OBSERVER, subject="test-observer")["access_token"]


@pytest.fixture
def client(operator_token: str) -> Generator[TestClient, None, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def setup() -> None:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    async def teardown() -> None:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    async def override_session() -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            yield session

    import asyncio

    asyncio.run(setup())
    app.dependency_overrides[get_db_session] = override_session
    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        yield test_client
    app.dependency_overrides.clear()
    asyncio.run(teardown())
