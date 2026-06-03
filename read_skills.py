import sys
import json
import os

tasks_file = "/Users/anjaemo/.gemini/antigravity-cli/brain/3103190b-3ea7-4e57-ac05-f7a04e09375d/scratch/tasks_1.txt"

with open(tasks_file, 'r', encoding='utf-8') as f:
    lines = f.read().splitlines()

file_paths = []
for line in lines:
    line = line.strip()
    if not line:
        continue
    if ':' in line:
        parts = line.split(':', 1)
        path = parts[1].strip()
        path = path.replace('`', '')
        if path.startswith('file://'):
            path = path[7:]
        if path.endswith('SKILL.md'):
            file_paths.append(path)
    else:
        path = line.replace('`', '')
        if path.startswith('file://'):
            path = path[7:]
        if path.endswith('SKILL.md'):
            file_paths.append(path)

# Remove duplicates while preserving order
seen = set()
unique_paths = []
for p in file_paths:
    if p not in seen:
        seen.add(p)
        unique_paths.append(p)

file_paths = unique_paths

if len(sys.argv) < 2:
    print("Usage: python3 read_skills.py [--list] [--read <index> [--start <line>] [--end <line>]] [--write <index>]")
    sys.exit(1)

mode = sys.argv[1]

if mode == "--list":
    for idx, path in enumerate(file_paths):
        print(f"{idx}: {path}")

elif mode == "--read":
    idx = int(sys.argv[2])
    start = 1
    end = None
    
    # parse arguments for start and end lines
    if "--start" in sys.argv:
        s_idx = sys.argv.index("--start")
        start = int(sys.argv[s_idx + 1])
    if "--end" in sys.argv:
        e_idx = sys.argv.index("--end")
        end = int(sys.argv[e_idx + 1])
        
    if 0 <= idx < len(file_paths):
        path = file_paths[idx]
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                content_lines = f.readlines()
            
            total_lines = len(content_lines)
            end_val = end if end is not None else total_lines
            
            # 1-indexed to 0-indexed conversion
            s_idx = max(0, start - 1)
            e_idx = min(total_lines, end_val)
            
            print(f"=== PATH: {path} (Lines {start}-{e_idx} of {total_lines}) ===")
            for i in range(s_idx, e_idx):
                print(content_lines[i], end="")
        else:
            print(f"ERROR: File not found: {path}")
    else:
        print(f"ERROR: Index out of range: {idx}")

elif mode == "--write":
    idx = int(sys.argv[2])
    if 0 <= idx < len(file_paths):
        path = file_paths[idx]
        content = sys.stdin.read()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"SUCCESS: Wrote to {path}")
    else:
        print(f"ERROR: Index out of range: {idx}")
