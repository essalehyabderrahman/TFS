import sys
from app import create_app
from app.extensions import db
from app.models.user_file import UserFile

app = create_app()
with app.app_context():
    files = UserFile.query.all()
    print(f"Total user files: {len(files)}")
    for f in files:
        print(f"ID: {f.id}, Name: {f.name}, Owner: {f.owner_id}, Parent: {f.parent_id}, Deleted: {f.is_deleted}")
