"""
TFS — Thumbnail Service
──────────────────────────────────────────────────────────────────────────────
Generates .webp thumbnails for image and video uploads.

Image support : Pillow (already a dependency — no install needed)
Video support : ffmpeg via subprocess (SYSTEM dependency)
                Install: sudo apt install ffmpeg  OR  brew install ffmpeg
                If ffmpeg is absent, video thumbnails are skipped gracefully.

Thumbnails are stored unencrypted in uploads/thumbnails/{record_id}.webp
and served via auth-protected routes.
"""
import os
import io
import subprocess
import logging

log = logging.getLogger("tfs.thumbnails")

THUMB_SIZE   = (320, 240)   # max width × height (aspect ratio preserved)
THUMB_QUALITY = 75           # webp quality 0-100


# ── helpers ───────────────────────────────────────────────────────────────────

def _thumb_dir(upload_folder: str) -> str:
    path = os.path.join(upload_folder, "thumbnails")
    os.makedirs(path, exist_ok=True)
    return path


def _image_thumb(raw_bytes: bytes, dest: str) -> bool:
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        img.thumbnail(THUMB_SIZE, Image.LANCZOS)
        img.save(dest, format="WEBP", quality=THUMB_QUALITY, method=4)
        return True
    except Exception as exc:
        log.warning("[thumbnail] Image generation failed: %s", exc)
        return False


def _video_thumb(stored_path: str, dest: str) -> bool:
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", "00:00:01",
                "-i", stored_path,
                "-vframes", "1",
                "-vf", f"scale={THUMB_SIZE[0]}:{THUMB_SIZE[1]}"
                       ":force_original_aspect_ratio=decrease",
                "-f", "image2",
                dest,
            ],
            capture_output=True,
            timeout=30,
        )
        return result.returncode == 0 and os.path.exists(dest)
    except FileNotFoundError:
        log.info("[thumbnail] ffmpeg not found — video thumbnails disabled.")
        return False
    except Exception as exc:
        log.warning("[thumbnail] Video generation failed: %s", exc)
        return False


# ── per-record generators ─────────────────────────────────────────────────────

def generate_for_transfer(transfer_id: str, app) -> bool:
    with app.app_context():
        from app.extensions import db
        from app.models.transfer import Transfer
        from app.services.file_service import _decrypt_file

        t = db.session.get(Transfer, transfer_id)
        if (not t or t.is_deleted or t.item_type != "file"
                or not t.stored_path or not os.path.exists(t.stored_path)):
            return False
        if t.file_type not in ("img", "video"):
            return False

        dest = os.path.join(_thumb_dir(app.config["UPLOAD_FOLDER"]), f"{t.id}.webp")

        if t.file_type == "img":
            with open(t.stored_path, "rb") as fp:
                raw = fp.read()
            if t.is_encrypted:
                try:
                    raw = _decrypt_file(raw)
                except Exception as exc:
                    log.warning("[thumbnail] Decrypt failed for %s: %s", t.id, exc)
                    return False
            ok = _image_thumb(raw, dest)

        else:  # video
            if t.is_encrypted:
                log.info("[thumbnail] Skipping encrypted video %s (ffmpeg requires plaintext).", t.id)
                return False
            ok = _video_thumb(t.stored_path, dest)

        if ok:
            t.thumbnail_path = dest
            db.session.commit()
            log.info("[thumbnail] Transfer %s → %s", t.id, dest)
        return ok


def generate_for_userfile(userfile_id: str, app) -> bool:
    with app.app_context():
        from app.extensions import db
        from app.models.user_file import UserFile
        from app.services.file_service import _decrypt_file

        uf = db.session.get(UserFile, userfile_id)
        if (not uf or uf.is_deleted or uf.item_type != "file"
                or not uf.stored_path or not os.path.exists(uf.stored_path)):
            return False
        if uf.file_kind not in ("img", "video"):
            return False

        dest = os.path.join(_thumb_dir(app.config["UPLOAD_FOLDER"]), f"{uf.id}.webp")

        if uf.file_kind == "img":
            with open(uf.stored_path, "rb") as fp:
                raw = fp.read()
            if uf.is_encrypted:
                try:
                    raw = _decrypt_file(raw)
                except Exception as exc:
                    log.warning("[thumbnail] Decrypt failed for %s: %s", uf.id, exc)
                    return False
            ok = _image_thumb(raw, dest)

        else:  # video
            if uf.is_encrypted:
                log.info("[thumbnail] Skipping encrypted video %s.", uf.id)
                return False
            ok = _video_thumb(uf.stored_path, dest)

        if ok:
            uf.thumbnail_path = dest
            db.session.commit()
            log.info("[thumbnail] UserFile %s → %s", uf.id, dest)
        return ok


# ── scheduler task ────────────────────────────────────────────────────────────

def process_pending_thumbnails(app) -> None:
    """
    Scan for image/video records with no thumbnail yet and generate them.
    Runs every 5 minutes via APScheduler. Also handles backfill of files
    uploaded before this feature was enabled.
    """
    with app.app_context():
        from app.models.transfer import Transfer
        from app.models.user_file import UserFile

        pending_t = Transfer.query.filter(
            Transfer.thumbnail_path.is_(None),
            Transfer.file_type.in_(["img", "video"]),
            Transfer.is_deleted == False,
            Transfer.item_type == "file",
            Transfer.stored_path.isnot(None),
        ).all()

        pending_uf = UserFile.query.filter(
            UserFile.thumbnail_path.is_(None),
            UserFile.file_kind.in_(["img", "video"]),
            UserFile.is_deleted == False,
            UserFile.item_type == "file",
            UserFile.stored_path.isnot(None),
        ).all()

        total = len(pending_t) + len(pending_uf)
        if not total:
            return

        log.info("[thumbnail] %d pending thumbnail(s) to generate.", total)
        for t  in pending_t:  generate_for_transfer(t.id, app)
        for uf in pending_uf: generate_for_userfile(uf.id, app)