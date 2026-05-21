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

    # [Concurrency] SQLite WAL mode — allows concurrent reads during writes
    # busy_timeout prevents "database is locked" errors under load
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"timeout": 15},
        "pool_pre_ping": True,
    }

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
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", str(_BASE_DIR / "uploads"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 100 * 1024 * 1024))  # 100 MB
    ALLOWED_EXTENSIONS = {
        # Documents & Office
        "pdf", "doc", "docx", "txt", "csv", "rtf",
        "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
        # Images
        "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico",
        # Video & Audio
        "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "ogg",
        # Archives
        "zip", "tar", "gz", "rar", "7z", "bz2",
        # Developer — Source code
        "py", "js", "ts", "tsx", "jsx", "java", "c", "cpp", "h", "hpp",
        "cs", "go", "rs", "rb", "php", "swift", "kt", "scala", "r",
        "lua", "pl", "sh", "bat", "ps1",
        # Developer — Web & Markup
        "html", "css", "scss", "less", "vue", "svelte",
        # Developer — Config & Data
        "json", "xml", "yaml", "yml", "toml", "ini", "env", "cfg",
        "md", "markdown", "rst",
        # Developer — DevOps & Infra
        "dockerfile", "tf", "hcl",
        # Developer — Database & Logs
        "sql", "db", "sqlite", "log",
        # Design & Other
        "sketch", "fig", "ai", "psd", "eps",
    }

    # CORS
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Default admin seeding (first boot only)
    ADMIN_EMAIL    = os.getenv("ADMIN_EMAIL", "")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
    ADMIN_RECOVERY_EMAIL = os.getenv("ADMIN_RECOVERY_EMAIL", ADMIN_EMAIL)

    # Global AES-256-GCM Encryption
    # If not set, a 32-byte key is derived from SECRET_KEY using PBKDF2-HMAC-SHA256
    ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")



class DevelopmentConfig(Config):
    DEBUG = True
    JWT_COOKIE_SECURE = False


class ProductionConfig(Config):
    DEBUG = False


config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}

def get_config():
    env = os.getenv("FLASK_ENV", "development")
    return config_map.get(env, DevelopmentConfig)


def validate_production_config():
    if os.getenv("FLASK_ENV") != "production":
        return

    failures = []

    secret_key = os.getenv("SECRET_KEY", "dev-secret-key")
    if secret_key == "dev-secret-key":
        failures.append("SECRET_KEY is using the insecure default value.")

    jwt_secret_key = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
    if jwt_secret_key == "dev-jwt-secret":
        failures.append("JWT_SECRET_KEY is using the insecure default value.")

    encryption_key = os.getenv("ENCRYPTION_KEY", "")
    if not encryption_key:
        failures.append("ENCRYPTION_KEY is not set. Files will use a derived key from SECRET_KEY which is weaker.")

    db_url = os.getenv("DATABASE_URL", f"sqlite:///{Config._DB_PATH}")
    if "sqlite" in db_url:
        failures.append("SQLite is not recommended for production. Set DATABASE_URL to a PostgreSQL URI.")

    if failures:
        raise RuntimeError("Production Configuration Errors:\n  - " + "\n  - ".join(failures))

# NOTE: validate_production_config() is intentionally NOT called here.
# It is called once inside create_app() after the config is loaded.