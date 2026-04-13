# app/extensions/redis_client.py
#
# Shared Redis client used for TOTP replay prevention and any other
# server-side ephemeral state that must be shared across workers.

import os
import redis
import logging

logger = logging.getLogger(__name__)

class MockRedis:
    """A minimal in-memory mock of redis-py for development use."""
    def __init__(self):
        self._storage = {}
        logger.info("Initializing MockRedis (In-Memory)")

    def set(self, name, value, ex=None, px=None, nx=False, xx=False):
        # [Security] Simulate atomic NX behavior for TOTP replay protection
        if nx and name in self._storage:
            return None
        if xx and name not in self._storage:
            return None
        
        self._storage[name] = value
        # Simple EX simulation isn't needed for dev functional testing 
        # but could be added if required.
        return True

    def get(self, name):
        return self._storage.get(name)

    def delete(self, *names):
        count = 0
        for name in names:
            if name in self._storage:
                del self._storage[name]
                count += 1
        return count

    def exists(self, *names):
        count = 0
        for name in names:
            if name in self._storage:
                count += 1
        return count

    def ping(self):
        return True

def get_redis_client():
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    try:
        # Using decode_responses=True simplifies handling since we store string metadata
        client = redis.from_url(url, decode_responses=True, socket_connect_timeout=1)
        client.ping()
        return client
    except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError):
        env = os.environ.get("FLASK_ENV", "development")
        if env == "development":
            logger.warning(f"Could not connect to Redis at {url}. Falling back to MockRedis.")
            return MockRedis()
        else:
            # In production, we WANT it to fail loudly if Redis is missing
            raise

# Module-level singleton — created once per worker process.
redis_client = get_redis_client()

