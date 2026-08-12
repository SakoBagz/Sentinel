from redis.asyncio import Redis

from app.config import get_settings


def create_redis_client() -> Redis:
    return Redis.from_url(get_settings().redis_url, decode_responses=True)


redis_client = create_redis_client()


async def close_redis() -> None:
    await redis_client.aclose()

