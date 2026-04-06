import traceback, sys

try:
    from app import create_app
    app = create_app()
    print("OK — routes:")
    for r in app.url_map.iter_rules():
        print(" ", r)
except Exception:
    traceback.print_exc()
