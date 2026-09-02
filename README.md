## [Math Olympiad Network: A Force-Directed Graph Visualization](https://seth-b27.github.io/math-olympiad-network/)

This project presents an interactive force-directed graph visualization exploring the relationships within a curated dataset of 67 mathematical problems from three competitions: high school level's [IMO](http://www.imo-official.org/) (International Mathematical Olympiad), [APMO](https://www.apmo-official.org/) (Asian Pacific Mathematical Olympiad), and undergraduate level's [PUTNAM](https://maa.org/putnam/) (William Lowell Putnam Mathematical Competition). 

---

### 1. Data Structure
Note: since the dataset was manually compiled from the mentioned original sources, there could possibly be some minor errors in contest metadata or problem statements.

**1.1. Source data format**

The project begins with `data_math_olympiad.json`, containing 67 problems structured as, for example:

```
{
    "id": "IMO-2024-P2",
    "contest": "IMO",
    "host": "Bath, United Kingdom",
    "year": 2024,
    "position": 2,
    "field": ["Number Theory"],
    "subfield": ["Elementary Number Theory"],
    "statement": "Determine all pairs $(a, b)$ of positive integers for which ...",
    "image_ref": "image.png" 
}
```
**1.2. Data stats**

After creating the dataset, `unique-value-count.py` helps extract and count unique values in each object.

- 3 contests: IMO (2020-2025), APMO (2020-2024), Putnam (2024)

- 67 problems: IMO (36 problems), APMO (25 problems), Putnam (6 problems)

- 4 fields (main areas): number theory (26), combinatorics (24), algebra (21), geometry (18)

- 22 subfields (specific topics in an area): elementary number theory (18), graph theory (16), Euclidean geometry (15), ...

All problem statements include original mathematical notation preserved in LaTeX format along with an image for problem 5 in IMO-2023.

---


### 2. Graph Construction

Then, `node-link.py` transforms the flat json to a graph structure by parsing the source file and extracting unique contests, fields, and subfields to generate:

(a) Four node types as mentioned in above _data stats_

(b) Three link types:
   - 67 contest-problem: each problem belongs to exactly one contest

   - 89 problem-field: problems can span multiple fields

   - 142 problem-subfield: problems connect to specific subfields

This produces a graph with 96 nodes and 298 links in total.

**Output file**: `data_node_link.json` which will be used to construct the graph.

Note: to allow natural clustering based on shared problem connections rather than imposing a rigid taxonomy, it's best to not link fields to their subfields.

---

### 3. Visualization Architecture
The visualization uses [D3.js](https://d3js.org/d3-force) v7's force simulation to create an organic, physics-based layout where node positions emerge from the interplay of multiple forces.


**Interaction model:**

- `node click`: selects a node, highlights its connections, and opens the sidebar for its detailed info

- `background click`: dismisses the sidebar and deselects the current node

- `drag`: allows manual repositioning of nodes. Dragging "reheats" the simulation, while releasing allows nodes to return to force equilibrium (unless specifically pinned)

- `zoom & pan`: standard D3 zoom behavior for zooming in/out and panning across the graph

- `simulation tick`: a single iteration of the physics loop where forces are calculated and coordinates are updated; occurs ~60 times per second to create fluid, lifelike motion

- `btn controls`: global methods exposed for resetting the view (re-centering the simulation), toggling labels for clarity, and filtering by types

- `window resize`: dynamically recalculates the viewport center and adjusts the layout when the window is resized

--- 

### 4. Physics implementation `initSimulation()`

**4.1. Multi-force system**: there are 4 primary forces working together to create a stable, readable layout:

(a) Link force (spring dynamic): `d3.forceLink`

- Treats edges as springs connecting nodes with configurable rest length and stiffness

- Implements **Hooke's law `F=-k(x-L)`** to create a hierarchical, multi-scale structure:
    
    - `k` : spring constant (stiffness)  `.strength()`. In d3, this value is typically between 0 and 1, representing the fraction of the distance error resolved per tick

    - `x` : current distance between node coordinates

    - `L` : rest length `.distance()`, the equilibrium point where no force is exerted

- Higher stiffness (`k`) forces nodes to reach their target rest length (`L`) more rigidly, reducing 'drift' or 'elasticity' in the connection. 
    - E.g., link type `contest-problem` uses `L=100` and `K=0.6`, making the problems move around contests closely.

(b) Charge force (electrostatic repulsion): `d3.forceManyBody`

- All nodes repel each other like charged particles of the same sign, preventing overcrowding and creating visual spacing. 

- Negative value of `chargeStrength` means repulsion; magnitude (-200) is calibrated to balance against link attration, controlling graph spread

(c) Centering force (mass repositioning): `d3.forceCenter`
- Gently repositions the graph's center of mass to viewport center without interfering with node relationships
- However, it does **not** add forces to individual nodes -- it simply shifts the entire system

(d) Collision force (hard-body dynamics): `d3.forceCollide`
- Creates "force fields" around nodes to prevent overlap
- Mechanics:
    - `.radius()`: define a "clearance zone" (`size` + `padding`) where no other node can penetrate
    - `.strength()`: tell how "hard" or "soft" the collision is (1.0 = solid bounce, less than 1.0 = soft overlapping)
    - `.iterations()`: set how many times the check runs per tick; higher values (like 2 in our case) ensure accuracy in crowded clusters.

Note: while charge force (long-range) pushes nodes apart from a distance (like gravity or magnetism), collision force (short range) only kicks in when nodes, in a sense, actually "touch" (when their collision radii overlap). it treats nodes as solid obj with physical volume rather than just points in space.


**4.2. Equilibrium behavior**: `getDragBehavior()` 
- All nodes return to a state of force equilibrium after being dragged, preserving natural layout and preventing distortion.


Note: **Dynamic Equilibrium** - when a node is dragged and released:

1. `Perturbation`: manual drag stretches connected springs, changing all distances

2. `Force Imbalance`: sum of forces F≠ 0 as spring tension increases

3. `Reheat`: `simulation.alphaTarget().restart()` increases system "temperature," allowing nodes to overcome friction and move freely

4. `Relaxation`: alpha decay gradually "cools" the system, reducing its kinetic energy while forces pull/push nodes until
F≈ 0

5. `New Equilibrium`: system settles into new balanced config.


We also have configurable `pinTypes` array that allows specific node types to remain pinned if needed (currently empty, making the graph fully elastic.)

**4.3. Alpha decay**: we use alpha ("energy"/"temperature") decay to achieve stable layout. First, the simulation starts at high alpha (1.0, used in `resetView`): initial chaos as all nodes are moving. Then, alpha decays, gradually decreasing each tick until `alphaMin` (near equilibrium, 0.001 as d3's default value). Simulation finally stops when `alpha < alphaMin`, reaching equilibrium.

Note: User interaction (drag/resize) temporarily reheats the system (alpha = 0.3 as in `handleResize`), then lets it cool back down.

--- 

### 5. Contribution
To extend this project, I invite you to:

- Add more problems by appending to `data_math_olympiad.json` following the existing schema
- Adjust physics by modifying force params in `scripts.js`, for example, for better graph behavior
- Enhance UI by adding some additional features like filters, search, or additional metadata displays

--- 

### 6. Acknowledgments

- **D3.js Community**: for comprehensive force simulation documentation
- **KaTeX Project**: for fast, beautiful mathematical rendering
- **Olympiad Organizations**: IMO, APMO, MAA for inspiring problems

---

### 7. Credits & License
This project is licensed under the **MIT License** created for educational purpose.  
It utilizes the [D3.js](https://d3js.org/) library (ISC License) and [KaTeX](https://katex.org) (MIT License).

Problem statements are copyright of their respective organizations (IMO, APMO, MAA).

Thank you! 

🍔
