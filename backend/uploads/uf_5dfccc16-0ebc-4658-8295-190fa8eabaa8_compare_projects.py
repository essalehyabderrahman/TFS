import os
import diff

dir1 = r"d:\TFS"
dir2 = r"d:\TFS\tfs1\TFS"

ignored_dirs = {".git", "tfs1", "node_modules", "venv", "__pycache__", "dist", "instance", ".gemini"}
ignored_files = {
    "db.sqlite", "tfs.db", "compare_projects.py", "diff_report.md", 
    "tree.txt", "check_schema.py", "query_files.py", "test_boot.py",
    # deliberately kept/different files:
    "recovery_request.py", "RecoveryManagement.tsx", "ForgotPassword.tsx", "auth.py"
}

def compare_file_contents(f1, f2):
    with open(f1, 'r', encoding='utf-8', errors='ignore') as fh1:
        lines1 = [line.strip() for line in fh1 if line.strip()]
    with open(f2, 'r', encoding='utf-8', errors='ignore') as fh2:
        lines2 = [line.strip() for line in fh2 if line.strip()]
    
    if lines1 != lines2:
        diff = list(difflib.unified_diff(lines1, lines2, n=0))
        real_diff = []
        for line in diff:
            if line.startswith('+') or line.startswith('-'):
                if not (line.startswith('+++') or line.startswith('---') or line.startswith('@@')):
                    real_diff.append(line)
        return real_diff
    return []

for root, dirs, files in os.walk(dir1):
    dirs[:] = [d for d in dirs if d not in ignored_dirs and not d.startswith(".")]
    for file in files:
        if file in ignored_files or file.endswith(".pyc") or file.endswith(".png") or file.endswith(".ico") or file.endswith(".tsbuildinfo"):
            continue
        rel_path = os.path.relpath(os.path.join(root, file), dir1)
        file2 = os.path.join(dir2, rel_path)
        if not os.path.exists(file2):
            continue
        
        if not any(rel_path.endswith(ext) for ext in [".py", ".ts", ".tsx", ".css", ".html", ".json"]):
            continue
            
        diff_lines = compare_file_contents(os.path.join(root, file), file2)
        if diff_lines:
            safe_rel_path = rel_path.encode('ascii', 'replace').decode('ascii')
            print(f"File differs: {safe_rel_path} ({len(diff_lines)} line changes)")
            for l in diff_lines[:6]:
                safe_l = l.encode('ascii', 'replace').decode('ascii')
                print("  ", safe_l)
            if len(diff_lines) > 6:
                print("   ...")
