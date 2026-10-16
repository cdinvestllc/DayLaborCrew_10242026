import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from auth import get_current_user, require_role, hash_secret, log_security_event
from database import db

router = APIRouter()
logger = logging.getLogger(__name__)
TICKET_TTL_SECONDS = 60


class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}
        self.user_locations: Dict[str, dict] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        old = self.connections.get(user_id)
        if old:
            try:
                await old.close(code=4000)
            except Exception:
                pass
        self.connections[user_id] = websocket
        logger.info(f"WS connected: {user_id} (total: {len(self.connections)})")

    def disconnect(self, user_id: str, websocket: WebSocket = None):
        if websocket is not None and self.connections.get(user_id) is not websocket:
            return
        self.connections.pop(user_id, None)
        self.user_locations.pop(user_id, None)
        logger.info(f"WS disconnected: {user_id}")

    async def close_user(self, user_id: str):
        ws = self.connections.pop(user_id, None)
        self.user_locations.pop(user_id, None)
        if ws:
            try:
                await ws.close(code=4003)
            except Exception:
                pass

    def update_user_location(self, user_id: str, lat: float, lng: float):
        self.user_locations[user_id] = {"lat": lat, "lng": lng}

    async def send_to_user(self, user_id: str, message: dict):
        ws = self.connections.get(user_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception as e:
                logger.warning(f"Failed to send to {user_id}: {e}")
                self.disconnect(user_id)

    async def broadcast_new_job(self, job: dict):
        """Broadcast new job to all connected crew members."""
        message = {"type": "new_job", "job": {k: v for k, v in job.items() if k != "_id"}}
        for user_id, ws in list(self.connections.items()):
            try:
                user = await db.users.find_one({"id": user_id, "role": "crew", "is_active": True}, {"_id": 0, "id": 1})
                if user:
                    await ws.send_text(json.dumps(message))
            except Exception as e:
                logger.warning(f"Failed to broadcast to {user_id}: {e}")

    async def broadcast_all(self, message: dict):
        for user_id, ws in list(self.connections.items()):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                self.disconnect(user_id)

    def get_online_users(self) -> List[str]:
        return list(self.connections.keys())

    def get_crew_locations(self) -> List[dict]:
        return [{"user_id": uid, **loc} for uid, loc in self.user_locations.items()]


manager = ConnectionManager()


def _valid_coord(value, limit: float) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and -limit <= value <= limit


@router.post("/ws/ticket")
async def create_ws_ticket(current_user: dict = Depends(get_current_user)):
    """Issues a short-lived, single-use ticket for opening a WebSocket."""
    raw = secrets.token_urlsafe(32)
    await db.ws_tickets.insert_one({
        "ticket_hash": hash_secret(raw),
        "user_id": current_user["id"],
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=TICKET_TTL_SECONDS),
    })
    return {"ticket": raw, "expires_in": TICKET_TTL_SECONDS}


async def _consume_ticket(ticket: str):
    if not ticket or len(ticket) > 128:
        return None
    doc = await db.ws_tickets.find_one_and_delete(
        {"ticket_hash": hash_secret(ticket), "expires_at": {"$gt": datetime.now(timezone.utc)}}
    )
    if not doc:
        return None
    user = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0, "id": 1, "role": 1, "is_active": 1})
    if not user or not user.get("is_active", True):
        return None
    return user


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, ticket: str = Query(None)):
    user = await _consume_ticket(ticket)
    if not user:
        log_security_event("ws_auth_failed")
        await websocket.close(code=4001)
        return

    user_id = user["id"]
    await manager.connect(user_id, websocket)
    try:
        await websocket.send_text(json.dumps({"type": "connected", "user_id": user_id, "role": user["role"]}))
        while True:
            data = await websocket.receive_text()
            if len(data) > 4096:
                continue
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue
            if not isinstance(msg, dict):
                continue
            msg_type = msg.get("type")
            if msg_type == "location_update":
                lat, lng = msg.get("lat"), msg.get("lng")
                if not (_valid_coord(lat, 90) and _valid_coord(lng, 180)):
                    continue
                city = str(msg.get("city") or "")[:120]
                result = await db.users.update_one(
                    {"id": user_id, "is_active": True},
                    {"$set": {"location": {"lat": lat, "lng": lng, "city": city}}}
                )
                if result.matched_count == 0:
                    await websocket.close(code=4003)
                    break
                manager.update_user_location(user_id, lat, lng)
            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WS error for {user_id}: {type(e).__name__}")
    finally:
        manager.disconnect(user_id, websocket)


@router.get("/ws/online-users")
async def get_online_users(admin: dict = Depends(require_role("admin", "super_admin"))):
    return {
        "online_count": len(manager.connections),
        "user_ids": manager.get_online_users(),
        "crew_locations": manager.get_crew_locations()
    }
