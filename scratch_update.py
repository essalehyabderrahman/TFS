import re

with open('d:/TFS/frontend/src/app/pages/TeamManagement.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Replace type definitions for role: <"admin" | "editor" | "viewer"> -> <"admin" | "user">
text = text.replace('"admin" | "editor" | "viewer"', '"admin" | "user"')

# 2. Replace the guard block (lines 144..155 approx)
guard_pattern = r"(?s)if\s*\(\s*user\?\.role === [\"\']viewer[\"\']\s*\)\s*\{\s*return\s*\(.*?\);\s*\}"
text = re.sub(guard_pattern, "", text)

# 3. Handle Select Dropdowns (Invite & Roles)
old_options = """<option value="viewer">Viewer - Can only view files</option>
                <option value="editor">Editor - Can upload and manage files</option>
                <option value="admin">Admin - Full access to all features</option>"""
new_options = """<option value="user">User — can upload and manage own files</option>
                <option value="admin">Admin — full access to all features</option>"""
text = text.replace(old_options, new_options)

old_options_single_line = '<option value="viewer">Viewer - Can only view files</option>'
text = text.replace(old_options_single_line, '<option value="user">User — can upload and manage own files</option>')
text = text.replace('<option value="editor">Editor - Can upload and manage files</option>', '<option value="user">User — can upload and manage own files</option>')
text = text.replace('<option value="admin">Admin - Full access to all features</option>', '<option value="admin">Admin — full access to all features</option>')

# 4. Collapse editor/viewer to user globally
text = text.replace('"viewer"', '"user"')
text = text.replace('"editor"', '"user"')
text = text.replace("'viewer'", "'user'")
text = text.replace("'editor'", "'user'")

# 5. Fix any '<"admin" | "user" | "user">' -> '<"admin" | "user">'
text = text.replace('"admin" | "user" | "user"', '"admin" | "user"')

# Write the updated text back before adding the settings block
with open('d:/TFS/frontend/src/app/pages/TeamManagement.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

# Also update AccountManagement.tsx
with open('d:/TFS/frontend/src/app/pages/AccountManagement.tsx', 'r', encoding='utf-8') as f:
    am_text = f.read()
am_text = am_text.replace('"viewer"', '"user"')
am_text = am_text.replace('"editor"', '"user"')
with open('d:/TFS/frontend/src/app/pages/AccountManagement.tsx', 'w', encoding='utf-8') as f:
    f.write(am_text)

print("done")
