from contextlib import asynccontextmanager
import logging
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder

from app.api.health import router as health_router
from app.api.mission_routes import router as mission_router
from app.api.run_routes import router as run_router
from app.api.realtime_routes import router as realtime_router
from app.api.failure_routes import router as failure_router
from app.api.history_routes import router as history_router
from app.api.metrics_routes import router as metrics_router
from app.api.ai_routes import router as ai_router
from app.api.demo_routes import router as demo_router
from app.api.vehicle_routes import router as vehicle_router
from app.api.waypoint_routes import router as waypoint_router
from app.api.auth_routes import router as auth_router
from app.api.audit_routes import router as audit_router
from app.config import get_settings
from app.db.session import dispose_engine
from app.realtime.redis import close_redis
from app.realtime.hub import hub
from app.realtime.runner import coordinator

logger = logging.getLogger(__name__)


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
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response


def _error_response(request: Request, status_code: int, code: str, message: str, details: object | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": getattr(request.state, "request_id", str(uuid4())),
                "details": details or {},
            }
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    code_by_status = {
        400: "VALIDATION_ERROR",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        429: "LIMIT_EXCEEDED",
    }
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    details = exc.detail if isinstance(exc.detail, dict) else {}
    return _error_response(request, exc.status_code, code_by_status.get(exc.status_code, "REQUEST_ERROR"), message, details)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return _error_response(request, 422, "VALIDATION_ERROR", "Request validation failed", {"fields": jsonable_encoder(exc.errors())})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled API error", extra={"request_id": getattr(request.state, "request_id", None)})
    return _error_response(request, 500, "INTERNAL_ERROR", "An internal error occurred")


app.include_router(health_router, prefix="/api/health")
app.include_router(auth_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(mission_router, prefix="/api")
app.include_router(run_router, prefix="/api")
app.include_router(realtime_router)
app.include_router(failure_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(metrics_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(demo_router, prefix="/api")
app.include_router(vehicle_router, prefix="/api")
app.include_router(waypoint_router, prefix="/api")


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {"service": "sentinel-api", "status": "running"}
