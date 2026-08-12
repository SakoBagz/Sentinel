from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.mission_routes import router as mission_router
from app.api.run_routes import router as run_router
from app.api.realtime_routes import router as realtime_router
from app.api.failure_routes import router as failure_router
from app.api.history_routes import router as history_router
from app.api.vehicle_routes import router as vehicle_router
from app.api.waypoint_routes import router as waypoint_router
from app.config import get_settings
from app.db.session import dispose_engine
from app.realtime.redis import close_redis
from app.realtime.hub import hub
from app.realtime.runner import coordinator


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await coordinator.stop_all()
    await hub.close()
    await close_redis()
    await dispose_engine()


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router, prefix="/api/health")
app.include_router(mission_router, prefix="/api")
app.include_router(run_router, prefix="/api")
app.include_router(realtime_router)
app.include_router(failure_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(vehicle_router, prefix="/api")
app.include_router(waypoint_router, prefix="/api")


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {"service": "sentinel-api", "status": "running"}
