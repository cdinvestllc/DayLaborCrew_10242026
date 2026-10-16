import asyncio
import os
import uuid
from datetime import datetime, timezone

import requests
from fastapi import HTTPException, UploadFile

from database import db

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "thedaylaborers"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
FILE_URL_PREFIX = "/api/public/files/"
_storage_key = None

# Detected from file content, never trusted from the client filename/content-type
_SIGNATURES = [
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
    (b"GIF87a", "gif", "image/gif"),
    (b"GIF89a", "gif", "image/gif"),
    (b"\x00\x00\x01\x00", "ico", "image/x-icon"),
]


def _init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def init_storage():
    return _init_storage()


def _put(path: str, data: bytes, content_type: str) -> dict:
    for attempt in range(2):
        key = _init_storage(force=attempt > 0)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
        if resp.status_code != 404:
            break
    resp.raise_for_status()
    return resp.json()


def _get(path: str) -> bytes:
    for attempt in range(2):
        key = _init_storage(force=attempt > 0)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
        if resp.status_code != 404:
            break
    resp.raise_for_status()
    return resp.content


def detect_image(data: bytes) -> tuple[str, str] | None:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    for sig, ext, mime in _SIGNATURES:
        if data.startswith(sig):
            return ext, mime
    return None


async def save_image(file: UploadFile, owner_id: str, category: str) -> str:
    """Validates and uploads an image; returns its public URL path."""
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image must be 5 MB or smaller")
    detected = detect_image(data)
    if not detected:
        raise HTTPException(status_code=400, detail="File must be a JPG, PNG, GIF or WEBP image")
    ext, mime = detected
    path = f"{APP_NAME}/{category}/{owner_id}/{uuid.uuid4().hex}.{ext}"
    try:
        result = await asyncio.to_thread(_put, path, data, mime)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Image upload failed. Please try again.")
    stored_path = result.get("path", path)
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": stored_path,
        "owner_id": owner_id,
        "category": category,
        "content_type": mime,
        "size": len(data),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return FILE_URL_PREFIX + stored_path


async def load_image(path: str) -> tuple[bytes, str]:
    record = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data = await asyncio.to_thread(_get, path)
    except requests.RequestException:
        raise HTTPException(status_code=404, detail="File not found")
    return data, record["content_type"]
