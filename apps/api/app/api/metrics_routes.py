from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from app.observability.metrics import metrics

router = APIRouter(tags=["diagnostics"])


@router.get("/metrics", response_class=PlainTextResponse)
async def system_metrics() -> PlainTextResponse:
    return PlainTextResponse(metrics.prometheus_text(), media_type="text/plain; version=0.0.4")
