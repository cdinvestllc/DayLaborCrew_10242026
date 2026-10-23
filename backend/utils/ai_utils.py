import os
import uuid
import json
import logging
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    # This optional vendor client is not published on public PyPI. Ranking remains
    # deterministic and rule-based when the client is unavailable.
    LlmChat = None
    UserMessage = None
from utils.geocoding import distance_between, valid_coords
from utils.profile_view import user_coords

logger = logging.getLogger(__name__)
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
MODEL = ("gemini", "gemini-3-flash-preview")
NOTIFY_THRESHOLD = 0.6


def job_coords(job: dict):
    loc = job.get("location") or {}
    return valid_coords(loc.get("lat"), loc.get("lng"))


def _words(text: str) -> set:
    return {w for w in "".join(ch.lower() if ch.isalnum() else " " for ch in (text or "")).split() if len(w) > 2}


def score_match(job: dict, crew: dict) -> tuple[float, str, float | None]:
    """Deterministic 0-1 score: trade, skills, distance, rating, work history, transportation."""
    reasons = []
    score = 0.0
    job_trade = (job.get("trade") or "").strip().lower()
    crew_trade = (crew.get("trade") or "").strip().lower()
    if job_trade and crew_trade == job_trade:
        score += 0.35
        reasons.append("trade match")
    skills = {s.lower() for s in crew.get("skills") or []}
    job_terms = _words(f"{job.get('title', '')} {job.get('description', '')} {job_trade}")
    overlap = {s for s in skills if s in job_terms or any(w in job_terms for w in _words(s))}
    if overlap:
        score += min(0.15, 0.05 * len(overlap))
        reasons.append("relevant skills")
    dist = distance_between(job_coords(job), user_coords(crew))
    if dist is None:
        score += 0.03
    else:
        score += 0.2 * max(0.0, 1 - dist / 50)
        if dist <= 15:
            reasons.append(f"{dist:.0f} mi away")
    rating = float(crew.get("rating") or 0)
    score += 0.15 * min(rating, 5) / 5
    score += 0.1 * min(int(crew.get("jobs_completed") or 0), 20) / 20
    if crew.get("transportation"):
        score += 0.05
    return round(min(score, 1.0), 3), ", ".join(reasons) or "available nearby", dist


def eligible_crew(job: dict, crew_candidates: list, min_results: int = 3) -> list:
    """Active, available crew within 50 mi (expanded to 100 mi only if too few)."""
    origin = job_coords(job)
    pool = [c for c in crew_candidates if c.get("availability") and c.get("is_active", True)
            and c["id"] not in (job.get("crew_accepted") or [])]
    if not origin:
        return pool
    for radius in (50, 100):
        near = [c for c in pool if (d := distance_between(origin, user_coords(c))) is None or d <= radius]
        if len(near) >= min_results or radius == 100:
            return near
    return pool


def _parse_json(raw: str):
    raw = raw.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        raw = raw[4:] if raw.startswith("json") else raw
    return json.loads(raw.strip())


async def ai_match_crew_for_job(job: dict, crew_candidates: list) -> list:
    """Rank eligible crew; AI may adjust scores but never adds IDs or bypasses eligibility."""
    pool = eligible_crew(job, crew_candidates)
    if not pool:
        return []
    base = {}
    for c in pool:
        s, reason, dist = score_match(job, c)
        base[c["id"]] = {"crew_id": c["id"], "score": s, "reason": reason,
                         "distance_miles": round(dist, 1) if dist is not None else None, "source": "rules"}
    top = sorted(base.values(), key=lambda m: (-m["score"], m["crew_id"]))[:20]
    try:
        by_id = {c["id"]: c for c in pool}
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=str(uuid.uuid4()),
            system_message=(
                "You score worker fit for a blue collar job. Consider trade, skills, distance, rating, "
                "work history and transportation. Return ONLY a JSON array: "
                '[{"crew_id":"id","score":0.0-1.0,"reason":"max 12 words"}]. Use only the given crew_id values.'
            ),
        ).with_model(*MODEL)
        payload = {
            "job": {"title": job.get("title"), "trade": job.get("trade"), "description": (job.get("description") or "")[:300],
                    "crew_needed": job.get("crew_needed", 1)},
            "workers": [{"crew_id": m["crew_id"], "trade": by_id[m["crew_id"]].get("trade", ""),
                         "skills": (by_id[m["crew_id"]].get("skills") or [])[:8], "rating": by_id[m["crew_id"]].get("rating", 0),
                         "jobs_completed": by_id[m["crew_id"]].get("jobs_completed", 0),
                         "transportation": by_id[m["crew_id"]].get("transportation"), "distance_miles": m["distance_miles"]}
                        for m in top],
        }
        ai = _parse_json(await chat.send_message(UserMessage(text=json.dumps(payload))))
        for item in ai if isinstance(ai, list) else []:
            cid = item.get("crew_id") if isinstance(item, dict) else None
            if cid not in base:
                continue
            try:
                ai_score = min(max(float(item.get("score")), 0.0), 1.0)
            except (TypeError, ValueError):
                continue
            m = base[cid]
            m["score"] = round(0.5 * m["score"] + 0.5 * ai_score, 3)
            m["reason"] = str(item.get("reason") or m["reason"])[:120]
            m["source"] = "ai"
    except Exception as e:
        logger.warning(f"AI matching unavailable, using rule-based scores: {type(e).__name__}")
    ranked = sorted(base.values(), key=lambda m: (-m["score"], m["crew_id"]))
    limit = max(3, int(job.get("crew_needed") or 1) * 3)
    for i, m in enumerate(ranked):
        m["notify"] = m["score"] >= NOTIFY_THRESHOLD and i < limit
    return ranked


async def generate_smart_job_matches(jobs: list, crew_member: dict) -> list:
    """Sort jobs for a crew member by deterministic fit; AI may reorder only known job IDs."""
    if not jobs:
        return jobs
    for j in jobs:
        s, reason, dist = score_match(j, crew_member)
        j["match_score"] = s
        j["match_reason"] = reason
        j["distance_miles"] = round(dist, 1) if dist is not None else None
    ranked = sorted(jobs, key=lambda j: (-j["match_score"], j["id"]))
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=str(uuid.uuid4()),
            system_message="Order jobs best to worst for this worker. Return ONLY a JSON array of the given job ids.",
        ).with_model(*MODEL)
        summary = [{"id": j["id"], "title": j["title"], "trade": j.get("trade"), "pay": j.get("pay_rate"),
                    "distance_miles": j["distance_miles"]} for j in ranked[:15]]
        worker = {"trade": crew_member.get("trade", ""), "skills": (crew_member.get("skills") or [])[:8],
                  "transportation": crew_member.get("transportation")}
        ordered = _parse_json(await chat.send_message(UserMessage(text=json.dumps({"worker": worker, "jobs": summary}))))
        known = {j["id"] for j in ranked[:15]}
        order = [i for i in dict.fromkeys(ordered if isinstance(ordered, list) else []) if i in known]
        pos = {jid: n for n, jid in enumerate(order)}
        head = sorted(ranked[:15], key=lambda j: pos.get(j["id"], len(pos) + ranked.index(j)))
        return head + ranked[15:]
    except Exception as e:
        logger.warning(f"Smart job ordering unavailable, using rule-based order: {type(e).__name__}")
        return ranked
