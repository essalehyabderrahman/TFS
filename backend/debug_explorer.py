"""
Quick debug script: test the explorer list + upload API.
Run from backend/ with: python debug_explorer.py
"""
import requests, json, sys, os

BASE = "http://localhost:5000"

s = requests.Session()

# Step 1 – grab a CSRF cookie first (any GET endpoint will set it)
print("=== Step 1: GET / to obtain CSRF cookie ===")
r = s.get(BASE + "/auth/csrf", allow_redirects=True)
print("Status:", r.status_code)
csrf = s.cookies.get("csrf_token", "")
print("CSRF token:", repr(csrf))

# Step 2 – sign in
print("\n=== Step 2: Sign in ===")
r = s.post(BASE + "/auth/signin",
    json={"email": "admin@tfs.com", "password": "Admin@Secure#2026"},
    headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"})
print("Status:", r.status_code)
try:
    print("Body:", json.dumps(r.json(), indent=2))
except Exception:
    print("Body (raw):", r.text[:500])

# Refresh CSRF after login (backend may rotate it)
csrf = s.cookies.get("csrf_token", csrf)
print("CSRF after login:", repr(csrf))

if r.status_code not in (200, 201):
    print("\nLogin failed. Try updating credentials in this script.")
    sys.exit(1)

# Step 3 – list explorer items at root
print("\n=== Step 3: GET /explorer?parentId=null ===")
r = s.get(BASE + "/explorer?parentId=null",
    headers={"X-CSRF-Token": csrf})
print("Status:", r.status_code)
try:
    body = r.json()
    print("Body:", json.dumps(body, indent=2))
    print(f"\n→ {len(body)} item(s) at root")
except Exception:
    print("Body (raw):", r.text[:500])

# Step 4 – upload a tiny test file
print("\n=== Step 4: POST /explorer/upload ===")
dummy_content = b"hello from debug_explorer.py"
files = {"file": ("debug_test.txt", dummy_content, "text/plain")}
data = {"parentId": "null", "encrypt": "true"}
r = s.post(BASE + "/explorer/upload",
    files=files, data=data,
    headers={"X-CSRF-Token": csrf})
print("Status:", r.status_code)
try:
    print("Body:", json.dumps(r.json(), indent=2))
except Exception:
    print("Body (raw):", r.text[:500])

# Step 5 – list again to confirm it appears
print("\n=== Step 5: GET /explorer?parentId=null (after upload) ===")
r = s.get(BASE + "/explorer?parentId=null",
    headers={"X-CSRF-Token": csrf})
print("Status:", r.status_code)
try:
    body = r.json()
    print("Body:", json.dumps(body, indent=2))
    print(f"\n→ {len(body)} item(s) at root after upload")
except Exception:
    print("Body (raw):", r.text[:500])
