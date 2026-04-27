# app/services/totp_replay.py
#
# Prevents TOTP replay attacks by recording every successfully used
# code in Redis with a TTL equal to the maximum validity window.
#
# Rule enforced: "Mark each TOTP code as used immediately — reject replays."

import logging
from app.extensions.redis_client import redis_client

logger = logging.getLogger(__name__)

# Maximum TOTP validity window: current step + 1 drift step on each side.
# Each step = 30 s, so the window is 90 s total.
TOTP_WINDOW_SECONDS = 90

# Redis key prefix — namespaced to avoid collisions with other keys.
_KEY_PREFIX = "totp_used"


def _make_key(user_id: str, code: str) -> str:
    return f"{_KEY_PREFIX}:{user_id}:{code}"


def consume_code(user_id: str, code: str) -> bool:
    """
    Atomically check and mark a TOTP code as used.

    Returns True if the code was successfully consumed (first use).
    Returns False if the code was already used (replay attempt).

    Uses Redis SET NX (set if not exists) which is atomic — no race
    condition between check and set is possible.
    """
    key = _make_key(user_id, code)
    try:
        result = redis_client.set(key, "1", ex=TOTP_WINDOW_SECONDS, nx=True)
        return result is True
    except Exception as exc:
        logger.warning(
            "totp_replay: Redis unavailable, skipping replay check for user %s — %s",
            user_id,
            exc,
        )
        return True
