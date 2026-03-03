'''
The math olympiad problem space can be represented as a multi-layer network with the following structure:

a. Nodes: 
    3 Contests
    4 Field 
    22 Subfield 
    67 Problem 

b. Links/Edges:
    Contest → Problems
    Problem → Field
    Problem → Subfield

*NOTE:  
We can also link each subfield to their parent field. 
However, this is not strictly necessary when we want the graph to be visualized purely based on given data alone. 
Linking fields to subfields would require an explicit mapping, introducing assumptions about the classification of topics.
So, they are commented out for now.
'''

import json
from collections import defaultdict
import os

GREEN = '\033[32m'
YELLOW = '\033[33m' 
BLUE = '\033[34m'
MAGENTA = '\033[35m'
RESET = '\033[0m'

script_dir = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(script_dir, "data_math_olympiad.json")

with open(json_path, "r", encoding="utf-8") as f:
    problems = json.load(f)

# field_subfield_mapping = {
#     'Number Theory': [
#         'Diophantine Equations',
#         'Elementary Number Theory',
#         'Modular Arithmetic'
#     ],
#     'Combinatorics': [
#         'Combinatorial Geometry',
#         'Extremal Problems',
#         'Game Theory',
#         'Graph Theory',
#         'Permutations',
#         'Pigeonhole Principle',
#         'Probability',
#         'Set Theory',
#         'Invariants'
#     ],
#     'Algebra': [
#         'Calculus',
#         'Functional Equations',
#         'Inequalities',
#         'Linear Algebra',
#         'Polynomials',
#         'Real Analysis',
#         'Sequences'
#     ],
#     'Geometry': [
#         'Circle Geometry',
#         'Configurational Geometry',
#         'Euclidean Geometry'
#     ]
# }

# count occurrences
contest_counts = defaultdict(int)
field_counts = defaultdict(int)
subfield_counts = defaultdict(int)

for problem in problems:
    contest_counts[problem['contest']] += 1
    for field in problem.get('field', []):
        field_counts[field] += 1
    for subfield in problem.get('subfield', []):
        subfield_counts[subfield] += 1

nodes = []

# 1. Create nodes
for contest, count in contest_counts.items():
    nodes.append({
        'id': f'contest-{contest}',
        'type': 'contest',
        'name': contest,
        'count': count,
        'group': 'contest'
    })

for field, count in field_counts.items():
    nodes.append({
        'id': f'field-{field.replace(" ", "")}',
        'type': 'field',
        'name': field,
        'count': count,
        'group': 'field'
    })

for subfield, count in subfield_counts.items():
    nodes.append({
        'id': f'subfield-{subfield.replace(" ", "")}',
        'type': 'subfield',
        'name': subfield,
        'count': count,
        'group': 'subfield'
    })

for problem in problems:
    nodes.append({
        'id': problem['id'],
        'type': 'problem',
        'contest': problem['contest'],
        'year': problem['year'],
        'position': problem['position'],
        'host': problem['host'],
        'fields': problem.get('field', []),
        'subfields': problem.get('subfield', []),
        'statement': problem.get('statement', ''),
        'image_ref': problem.get('image_ref', None), 
        'group': problem['contest']  # For coloring by contest
    })

# 2. Create links/edges
links = []
# Contest → Problem 
for problem in problems:
    links.append({
        'source': f'contest-{problem["contest"]}',
        'target': problem['id'],
        'type': 'contest-problem'
    })

# Problem → Field
for problem in problems:
    problem_id = problem['id']
    for field in problem.get('field', []):
        links.append({
            'source': problem_id,
            'target': f'field-{field.replace(" ", "")}',
            'type': 'problem-field'
        })

# Problem → Subfield
for problem in problems:
    problem_id = problem['id']
    for subfield in problem.get('subfield', []):
        links.append({
            'source': problem_id,
            'target': f'subfield-{subfield.replace(" ", "")}',
            'type': 'problem-subfield'
        })

# Field → Subfield 
# for field, subfields in field_subfield_mapping.items():
#     field_id = f'field-{field.replace(" ", "")}'
#     for subfield in subfields:
#         subfield_id = f'subfield-{subfield.replace(" ", "")}'
#         links.append({
#             'source': field_id,
#             'target': subfield_id,
#             'type': 'field-subfield'
#         })

graph_data = {
    'nodes': nodes,
    'links': links,
    'metadata': {
        'total_contests': len([n for n in nodes if n['type'] == 'contest']),
        'total_problems': len([n for n in nodes if n['type'] == 'problem']),
        'total_fields': len([n for n in nodes if n['type'] == 'field']),
        'total_subfields': len([n for n in nodes if n['type'] == 'subfield']),
        'total_nodes': len(nodes),
        'total_links': len(links)
    }
}

with open('data/data_node_link.json', 'w') as f:
    json.dump(graph_data, f, indent=2)


print(f"\n{BLUE}STATS: {RESET}")
print(f"Nodes: {GREEN}{len(nodes)}{RESET}")
print(f"    a. Contests: {MAGENTA}{graph_data['metadata']['total_contests']}{RESET}")
print(f"    b. Problems: {MAGENTA}{graph_data['metadata']['total_problems']}{RESET}")
print(f"    c. Fields: {MAGENTA}{graph_data['metadata']['total_fields']}{RESET}")
print(f"    d. Subfields: {MAGENTA}{graph_data['metadata']['total_subfields']}{RESET}")
print(f"\nLinks: {GREEN}{len(links)}{RESET}")
print(f"    a. Contest → Problem: {MAGENTA}{len([l for l in links if l['type'] == 'contest-problem'])}{RESET}")
print(f"    b. Problem → Field: {MAGENTA}{len([l for l in links if l['type'] == 'problem-field'])}{RESET}")
print(f"    c. Problem → Subfield: {MAGENTA}{len([l for l in links if l['type'] == 'problem-subfield'])}{RESET}")
# print(f"    d. Field → Subfield: {MAGENTA}{len([l for l in links if l['type'] == 'field-subfield'])}{RESET}")