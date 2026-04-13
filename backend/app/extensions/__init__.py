from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from .talisman import talisman, init_talisman
from .redis_client import redis_client

db   = SQLAlchemy()
jwt  = JWTManager()
bcrypt = Bcrypt()
cors = CORS()

# [Security] IP-based rate limiter — no global default; limits applied per-route
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],     # no global default — limits applied explicitly per route
    headers_enabled=True,  # sends X-RateLimit-* headers in responses
)