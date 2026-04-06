import os
import uuid
import random
from datetime import datetime, timezone, timedelta

# Force absolute path for SQLite to prevent Windows relative path bugs
base_dir = os.path.abspath(os.path.dirname(__file__))
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(base_dir, 'instance', 'tfs.db')}"

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.transfer import Transfer, FileVersion
from app.models.audit_log import AuditLog

# Create the flask app configured appropriately
app = create_app()

def generate_uuid():
    return str(uuid.uuid4())

with app.app_context():
    print("Dropping all existing tables...")
    db.drop_all()

    print("Creating all tables...")
    db.create_all()

    print("Populating database with mock data...")

    # 1. Users
    admin = User(
        id="u1_admin",
        name="Admin User",
        email="admin@company.com",
        role="admin",
        status="active",
        avatar="AU",
        created_at=datetime.now(timezone.utc) - timedelta(days=90),
        last_active=datetime.now(timezone.utc) - timedelta(hours=2)
    )
    admin.set_password("admin123")
    
    sarah = User(
        id="u2_sarah",
        name="Sarah Chen",
        email="sarah.chen@company.com",
        role="editor",
        status="active",
        avatar="SC",
        created_at=datetime.now(timezone.utc) - timedelta(days=60),
        last_active=datetime.now(timezone.utc) - timedelta(hours=5)
    )
    sarah.set_password("password123")

    michael = User(
        id="u3_michael",
        name="Michael Roberts",
        email="michael.roberts@company.com",
        role="editor",
        status="active",
        avatar="MR",
        created_at=datetime.now(timezone.utc) - timedelta(days=20),
        last_active=datetime.now(timezone.utc) - timedelta(minutes=45)
    )
    michael.set_password("password123")

    emily = User(
        id="u4_emily",
        name="Emily Zhang",
        email="emily.zhang@company.com",
        role="viewer",
        status="active",
        avatar="EZ",
        created_at=datetime.now(timezone.utc) - timedelta(days=10)
    )
    emily.set_password("password123")

    david = User(
        id="u5_david",
        name="David Martinez",
        email="david.martinez@company.com",
        role="editor",
        status="active",
        avatar="DM",
        created_at=datetime.now(timezone.utc) - timedelta(days=1)
    )
    david.set_password("password123")

    users = [admin, sarah, michael, emily, david]
    db.session.add_all(users)

    # 2. Transfers
    now = datetime.now(timezone.utc)
    t1 = Transfer(
        id=generate_uuid(),
        file_name="Q1_Financial_Report.pdf",
        file_type="pdf",
        original_name="Q1_Financial_Report.pdf",
        stored_path="/uploads/Q1_Financial_Report.pdf",
        size_bytes=3200000,
        status="Delivered",
        encryption_type="AES-256",
        uploaded_by_id=sarah.id,
        recipient_email="finance@partner.com",
        download_count=3,
        created_at=now - timedelta(days=1),
        expiry_date=now + timedelta(days=6)
    )

    t2 = Transfer(
        id=generate_uuid(),
        file_name="Contract_Draft_v3.docx",
        file_type="doc",
        original_name="Contract_Draft_v3.docx",
        stored_path="/uploads/Contract_Draft_v3.docx",
        size_bytes=1800000,
        status="Pending",
        encryption_type="AES-256",
        uploaded_by_id=michael.id,
        recipient_email="legal@client.com",
        download_count=0,
        created_at=now - timedelta(hours=5),
        expiry_date=now + timedelta(days=7)
    )

    t3 = Transfer(
        id=generate_uuid(),
        file_name="Product_Mockups.zip",
        file_type="zip",
        original_name="Product_Mockups.zip",
        stored_path="/uploads/Product_Mockups.zip",
        size_bytes=45700000,
        status="Delivered",
        encryption_type="AES-256",
        uploaded_by_id=emily.id,
        recipient_email="design@agency.com",
        download_count=1,
        created_at=now - timedelta(days=2),
        expiry_date=now + timedelta(days=5)
    )

    t4 = Transfer(
        id=generate_uuid(),
        file_name="Security_Audit_2026.pdf",
        file_type="pdf",
        original_name="Security_Audit_2026.pdf",
        stored_path="/uploads/Security_Audit_2026.pdf",
        size_bytes=2100000,
        status="Pending",
        encryption_type="AES-256",
        uploaded_by_id=david.id,
        recipient_email="compliance@corp.com",
        download_count=0,
        created_at=now - timedelta(minutes=15),
        expiry_date=now + timedelta(days=7),
        locked_by_id=admin.id,
        locked_at=now - timedelta(minutes=10)
    )

    db.session.add_all([t1, t2, t3, t4])

    # 3. Audit Logs
    logs = [
        AuditLog(id=generate_uuid(), user_id=admin.id, user_email=admin.email, action="LOGIN_SUCCESS", 
                 resource="/auth/login", ip_address="192.168.1.10", location="Paris, FR", status="success",
                 details="Admin user logged in successfully", timestamp=now - timedelta(days=1)),
                 
        AuditLog(id=generate_uuid(), user_id=sarah.id, user_email=sarah.email, action="FILE_UPLOAD", 
                 resource=t1.file_name, ip_address="192.168.1.42", location="Lyon, FR", status="success",
                 details=f"Uploaded {t1.file_name} successfully", timestamp=t1.created_at),

        AuditLog(id=generate_uuid(), user_id=admin.id, user_email=admin.email, action="FILE_DOWNLOAD", 
                 resource=t2.file_name, ip_address="192.168.1.10", location="Paris, FR", status="success",
                 details=f"Downloaded {t2.file_name}", timestamp=now - timedelta(hours=2)),
                 
        AuditLog(id=generate_uuid(), user_id=admin.id, user_email=admin.email, action="PERMISSION_CHANGE", 
                 resource="Security Settings", ip_address="192.168.1.10", location="Paris, FR", status="success",
                 details="Updated global encryption policy to AES-256 GCM", timestamp=now - timedelta(hours=1)),

        AuditLog(id=generate_uuid(), user_id=None, user_email="unknown", action="LOGIN_FAILED", 
                 resource="/auth/login", ip_address="198.51.100.23", location="Moscow, RU", status="failed",
                 details="Failed login attempt for admin@company.com", timestamp=now - timedelta(minutes=30)),
    ]

    db.session.add_all(logs)

    db.session.commit()
    print("Database initialization and data seeding completed successfully!")
