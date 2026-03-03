import json
import os
from collections import Counter

GREEN = '\033[32m'
YELLOW = '\033[33m' 
BLUE = '\033[34m'
MAGENTA = '\033[35m'
RESET = '\033[0m'

script_dir = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(script_dir, "data_math_olympiad.json")

with open(json_path, "r", encoding="utf-8") as f:
    problems = json.load(f)

field_list = []
subfield_list = []
contests_list = []
positions_list = []

for p in problems:
    contests_list.append(p.get("contest"))
    positions_list.append(p.get("position"))

    for f in p.get("field", []):
        field_list.append(f.strip())

    for s in p.get("subfield", []):
        subfield_list.append(s.strip())


field_counts = Counter(field_list)
subfield_counts = Counter(subfield_list)
contest_counts = Counter(contests_list)
position_counts = Counter(positions_list)

print(f"{YELLOW}\nCONTESTS:{RESET}")
for c, count in sorted(contest_counts.items(), key=lambda x: x[1], reverse=True):
    print(f"  {c}: {count}")

print(f"\n{MAGENTA}POSITIONS:{RESET}")
for pos, count in sorted(position_counts.items()):
    print(f"  {pos}: {count}")

print(f"\n{GREEN}FIELD:{RESET}")
for f, count in sorted(field_counts.items(), key=lambda x: x[1], reverse=True):
    print(f"  {f}: {count}")

print(f"\n{BLUE}SUBFIELD:{RESET}")
for s, count in sorted(subfield_counts.items(), key=lambda x: x[1], reverse=True):
    print(f"  {s}: {count}")

# with open("data/unique_field.txt", "w") as f:
#     for f in sorted(field_counts.keys()):
#         f.write(f + "\n")

# with open("data/unique_subfield.txt", "w") as f:
#     for s in sorted(subfield_counts.keys()):
#         f.write(s + "\n")