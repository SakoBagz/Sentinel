import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import Role, decode_token
from app.db.session import get_db_session
from app.realtime.hub import hub
from app.services.run_service import RunNotFound, get_run

router = APIRouter(tags=["realtime"])


@router.websocket("/ws/runs/{run_id}")
async def run_websocket(
    websocket: WebSocket,
    run_id: UUID,
    token: str | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> None:
    if not token:
        await websocket.close(code=4401, reason="Authentication required")
        return
    try:
        principal = decode_token(token)
    except Exception:
        await websocket.close(code=4401, reason="Invalid session token")
        return
    if principal.role not in {Role.OPERATOR, Role.OBSERVER}:
        await websocket.close(code=4403, reason="Forbidden")
        return

    await websocket.accept()
    try:
        await get_run(db_session, run_id)
    except RunNotFound:
        await websocket.close(code=4404, reason="Run not found")
        return
    session = hub.connect(run_id)
    send_lock = asyncio.Lock()

    async def send_messages() -> None:
        while not session.closed:
            message = await session.queue.get()
            async with send_lock:
                await websocket.send_json(message)

    sender = asyncio.create_task(send_messages())
    try:
        async with send_lock:
            await websocket.send_json(
                {
                    "type": "connection.ready",
                    "data": {"run_id": str(run_id), "role": principal.role.value},
                }
            )
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=25)
            except asyncio.TimeoutError:
                async with send_lock:
                    await websocket.send_json({"type": "heartbeat", "data": {"run_id": str(run_id)}})
                continue
            message_type = message.get("type") if isinstance(message, dict) else None
            if message_type == "subscribe":
                topics = message.get("topics", [])
                try:
                    hub.subscribe(session, topics)
                    async with send_lock:
                        await websocket.send_json(
                            {"type": "subscription.ready", "data": {"topics": sorted(session.topics)}}
                        )
                except ValueError as exc:
                    async with send_lock:
                        await websocket.send_json(
                            {"type": "subscription.error", "data": {"message": str(exc)}}
                        )
            elif message_type == "ping":
                async with send_lock:
                    await websocket.send_json({"type": "pong", "data": {"run_id": str(run_id)}})
            else:
                async with send_lock:
                    await websocket.send_json(
                        {"type": "system.warning", "data": {"message": "Unsupported client message"}}
                    )
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        try:
            await sender
        except asyncio.CancelledError:
            pass
        await hub.disconnect(session)
