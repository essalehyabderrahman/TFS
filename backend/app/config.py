import os
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the backend root directory (parent of app/)
_BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BASE_DIR / ".env")

class Config:
    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    DEBUG = False
    TESTING = False

    # Database
    _DB_PATH = _BASE_DIR / "instance" / "tfs.db"
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", f"sqlite:///{_DB_PATH}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    # [Security] Cryptographically random secret — must be set via env var in production
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
    # [Session] 15-minute idle timeout (tokens expire if not refreshed within 15 min)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 15)))
    # [Session] 8-hour absolute max lifetime stored as a custom claim (enforced in middleware)
    JWT_SESSION_ABSOLUTE_MAX_HOURS = int(os.getenv("JWT_SESSION_ABSOLUTE_MAX_HOURS", 8))
    # [Session] Session transport protocol
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_SECURE = True
    JWT_COOKIE_SAMESITE = "Strict"
    JWT_COOKIE_CSRF_PROTECT = False # Disabled because we enforce a strict custom X-TFS-CSRF header requirement independently

    # [Security] bcrypt cost factor — explicitly ≥ 12 as per spec
    BCRYPT_LOG_ROUNDS = int(os.getenv("BCRYPT_LOG_ROUNDS", 12))

    # Uploads
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 100 * 1024 * 1024))  # 100 MB
    ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "gif", "zip", "mp4", "doc", "docx", "txt", "csv"}

    # CORS
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Global AES-256-GCM Encryption
    # If not set, a 32-byte key is derived from SECRET_KEY using PBKDF2-HMAC-SHA256
    ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")



class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}

def get_config():
    env = os.getenv("FLASK_ENV", "development")
    return config_map.get(env, DevelopmentConfig)