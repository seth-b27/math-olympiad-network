const GRAPH_CONFIG = {
    // LAYOUT PHYSICS PARAM
    layout: {
        /* 
            - spring rest-lengths (L) (equilibrium distance) between different node types
            - higher value means that nodes sit farther apart
            - since contests are major hubs, we give them more space compared to the others
        */
        distances: { 
            'contest-problem': 100,
            'problem-field': 80,
            'problem-subfield': 60,
            'default': 70,
        },

        /*
            - spring stiffness (k) (0-no pull, 1-max pull)
            - stronger springs = nodes pull tighter tgt
        */
        stiffness: {
            'contest-problem': 0.6, // problems will orbit contests closely
            'problem-field': 0.4,
            'problem-subfield': 0.25, // subfields will form like floating clouds
            'default': 0.2, // very loose for other unexpected connections (the nodes will drift lazily)
        },

        /*
            - repulsion force between ALL nodes (negative = repel, positive = attract)
            - higher magnitude = more spread out graph (prevent clustering)
            - -200 would give a nice spacing for our 96 nodes
        */
        chargeStrength: -200,

        /*
            - collision-detection would help prevent node overlaps
            - padding is added to the node's radius for some breathing room
        */
        collision: {
            default: 10,  // problem and subfield get standard spacing
            contest: 25, // 10+25=35px collision radius
            field: 15,
            strength: 1, // full collision force (typical range 0-1 for d3, though >1 is allowed but unstable)
            iterations: 2 // run detection twice per tick for accuracy
        }
    },

    visual: {
        nodeSize: {
            contest: 10, //these are the anchors; radius in px
            field: 8,
            subfield: 6,
            problem: 4
        },

        nodeColor: {
            contest: '#1a1a1a',
            problem: '#4a4a4a',
            field: '#7a7a7a',
            subfield: '#aaaaaa'
        }
    },

    /*
        - in d3, "Alpha" is like temperature
        - by increasing it = "melting" the graph so it can flow
        - and w/o this "reheat," the graph would be too "cold" to move and fix the imbalance
    */
    animation: {
        initialZoomScale: 0.7, // zoom out to 70% on load (shows full graph)
        initialZoomDuration: 1000, // zoom animation takes 1s
        dragAlpha: 0.3, // simulation "heat" during drag (0 stopped - 1 active)
        resizeDebounce: 250 // and wait 250ms after last resize before recalculating
    },

    /* 
        - IN CASE, we want any specific node types to remain pinned afer drag, add them into the following array
        - however, default is empty array: all nodes are to return to force equilibrium
        - releasing all nodes would preserve natural layout and prevent distortion
    */
    interaction: {
        pinTypes: []
    }
}

// PURE FUNCTIONS AS EACH NODE TYPE HAS ITS OWN RENDER
const sidebarRenderers = {
    contest: (d) => {
        return `
            <h2>${d.name}</h2>
            <div class="type">CONTEST</div>
            <div class="meta">
                <div class="meta-item">
                    <span class="meta-label">Problems</span>${d.count}
                </div>
            </div>
        `;
    },

    problem: (d) => {
        return `
            <h2>${d.name || d.id}</h2>
            <div class="type">PROBLEM</div>
            <div class="meta">
                <div class="meta-item">
                    <span class="meta-label">Contest</span>${d.contest} ${d.year}
                </div>
                <div class="meta-item">
                    <span class="meta-label">Position</span>Problem ${d.position}
                </div>
                <div class="meta-item">
                    <span class="meta-label">Host</span>${d.host}
                </div>
                ${d.fields?.length ? `
                    <div class="meta-item">
                        <span class="meta-label">Fields</span>${d.fields.join(', ')}
                    </div>
                ` : ''}
                ${d.subfields?.length ? `
                    <div class="meta-item">
                        <span class="meta-label">Subfields</span>${d.subfields.join(', ')}
                    </div>
                ` : ''}
            </div>
            ${d.statement ? `
                <div class="statement" id="math-content">${d.statement}</div>
            ` : ''}
            ${d.image_ref ? `
                <div style="margin-top: 16px; padding: 12px; background: #f5f5f5; border-radius: 4px;">
                    <a href="${d.image_ref}" target="_blank" style="color: #666; text-decoration: none; font-size: 11px; display: flex; align-items: center; gap: 8px;">
                        <span>View Problem Image →</span>
                    </a>
                </div>
            ` : ''}
        `;
    },

    field: (d) => {
        return `
            <h2>${d.name}</h2>
            <div class="type">FIELD</div>
            <div class="meta">
                <div class="meta-item">
                    <span class="meta-label">Problems</span>${d.count}
                </div>
            </div>
        `;
    },

    subfield: (d) => {
        return `
            <h2>${d.name}</h2>
            <div class="type">SUBFIELD</div>
            <div class="meta">
                <div class="meta-item">
                    <span class="meta-label">Problems</span>${d.count}
                </div>
            </div>
        `;
    }
};

// HELPER : helps render connections section (shared by all node types)
function renderConnections(graphData, d) {
    const connections = graphData.links
        .filter(l => l.source.id === d.id || l.target.id === d.id)
        .map(l => {
            const target = l.source.id === d.id ? l.target : l.source;
            return `<div class="connection-item">${target.name || target.id} <span style="color:#ccc">(${target.type})</span></div>`;
        });

    if (connections.length === 0) return '';

    return `
        <div class="connections">
            <div style="color:#999;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 12px 0;">
                Connections (${connections.length})
            </div>
            ${connections.join('')}
        </div>
    `;
}

// HELPER: helps render LaTeX equations using KaTeX
function renderLatex(element, retries = 10) {
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(element, {
            delimiters: [
                { left: '\\[', right: '\\]', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false
        });
    } else if (retries > 0) {
        // KaTeX not loaded yet, retry after delay
        setTimeout(() => renderLatex(element, retries-1), 100);
    }
}

// MAIN CLASS - encapsulate all graph state and behaviour
class MathOlympiadGraph {
    constructor(svgSelector, dataPath, config = GRAPH_CONFIG) {
        // simple config
        this.svgSelector = svgSelector;
        this.dataPath = dataPath;
        this.config = config;

        // graph data
        this.graphData = null;

        // D3 objects
        this.svg = null;
        this.g = null;
        this.zoom = null;
        this.simulation = null;
        this.node = null;
        this.link = null;

        // UI state
        this.selectedNode = null;
        this.showingLabels = false;
        this.currentFilter = null;
        this.filterIndex = 0;

        // resize debounce timer
        this.resizeTimeout = null;
    }

    // ____________________________________________________
    // INITIALIZATION - load data, setup graph, bind events
    // ____________________________________________________
    async init() {
        try {
            await this.loadData();
            this.initGraph();
            this.bindEvents();
        } catch (error) {
            console.error('Failed to initialize graph: ', error);
        }
    }

    async loadData() {
        const data = await d3.json(this.dataPath);
        this.graphData = data;

        // update stats display
        document.getElementById('node-count').textContent = data.nodes.length;
        document.getElementById('edge-count').textContent = data.links.length;
    }

    initGraph() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // create SVG
        this.svg = d3.select(this.svgSelector)
            .attr("width", width)
            .attr("height", height);

        this.g = this.svg.append("g"); 
        // inner group that all nodes/links live in, and zoom transforms this, not the svg itself (other UI elements aren't affected by zoom)

        // setup zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 3]) // zoom limits: 10% (fully zoomed out) - 300% (fully zoomed in)
            .on("zoom", (event) => {
                this.g.attr("transform", event.transform);
            });

        this.svg.call(this.zoom);

        // initialize simulation
        this.initSimulation(width, height);

        // create links and nodes
        this.initLinks();
        this.initNodes();

        // setup interactions
        this.initInteractions();

        // initial zoom animation
        this.performInitialZoom(width, height);
    }

    initSimulation(width, height) {
        const cfg = this.config;

        // create force simulation (here's the physics thing that positions nodes)
        this.simulation = d3.forceSimulation(this.graphData.nodes)

            // link force with dynamic distances and strengths based on node types
            .force("link", d3.forceLink(this.graphData.links)
                .id(d => d.id) // how to match links to nodes
                .distance(d => cfg.layout.distances[d.type] || cfg.layout.distances.default)
                .strength(d => cfg.layout.stiffness[d.type] || cfg.layout.stiffness.default))

            // charge force: all nodes repel each other (in a sense, like electirc charge)
            .force("charge", d3.forceManyBody()
                .strength(cfg.layout.chargeStrength))

            // centering force: rather than pushing nodes, it shifts the entire system so that the center of mass stays at the viewport center
            .force("center", d3.forceCenter(width / 2, height / 2))

            // collision - create "force fields" around each node
            .force("collision", d3.forceCollide()
                .radius(d => {
                    const size = cfg.visual.nodeSize[d.type];
                    const padding = cfg.layout.collision[d.type] || cfg.layout.collision.default;
                    return size + padding;
                })
                .strength(cfg.layout.collision.strength)
                .iterations(cfg.layout.collision.iterations));
    }

    initLinks() {
        /* 
            - create SVG group for all links, then bind data
            - each data object is paired with a <line> element, so they can stay in sync as nodes move
        */
        this.link = this.g.append("g")
            .selectAll("line")
            .data(this.graphData.links)
            .join("line") // d3's modern join pattern (handles enter, update, and exit automatically)
            .attr("class", "link");
    }

    initNodes() {
        const cfg = this.config;

        /* 
            - same here, we create SVG group for all nodes, then bind data
            - each node is a <g> (group) containing circle + text, so they can move tgt
        */
        this.node = this.g.append("g")
            .selectAll("g")
            .data(this.graphData.nodes)
            .join("g")
            .attr("class", "node")
            .call(this.getDragBehavior());

        this.node.append("circle")
            .attr("r", d => cfg.visual.nodeSize[d.type])
            .attr("fill", d => cfg.visual.nodeColor[d.type]);

        // add labels (it starts hidden with opacity: 0 as in css)
        this.node.append("text")
            .attr("dy", d => cfg.visual.nodeSize[d.type] + 14)
            .text(d => d.name || d.id);
    }

    initInteractions() {
        // node click handler 
        this.node.on("click", (event, d) => this.handleNodeClick(event, d));

        // background click closes sidebar
        this.svg.on("click", () => this.closeSidebar());

        // simulation tick: recalculates and re-renders positions every frame (typically 60fps) 
        // this is where the pysics calculations are applied to visual positions
        this.simulation.on("tick", () => {
            // update link positions (source and target endpoints)
            this.link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            // move the entire node group using a single translation
            this.node.attr("transform", d => `translate(${d.x},${d.y})`);
        });
    }

    performInitialZoom(width, height) {
        // wait 100ms for initial layout to settle
        setTimeout(() => {
            const bounds = this.g.node().getBBox();
            const fullWidth = bounds.width;
            const fullHeight = bounds.height;

            // center of the graph
            const midX = bounds.x + fullWidth / 2;
            const midY = bounds.y + fullHeight / 2;

            // zoom scale: divide 0.7 by the larger dimesion ratio to fit the graph in viewport (like letterboxing logic?)
            const scale = this.config.animation.initialZoomScale / Math.max(fullWidth / width, fullHeight / height);

            // translation to center the scaled graph
            const translate = [
                (width / 2) - (scale * midX), // center horizontally 
                (height / 2) - (scale * midY) // center vertically 
            ];

            // animate zoom
            this.svg.transition()
                .duration(this.config.animation.initialZoomDuration)
                .call(this.zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
        }, 100);
    }

    bindEvents() {
        // window resize handler (debounced): wait until user stops resizing for 250ms before recalculating layout to prevent performance issues
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, this.config.animation.resizeDebounce);
        });
    }

    // ____________________
    // INTERACTION HANDLERS
    // ____________________

    handleNodeClick(event, d) {
        event.stopPropagation();

        // deselect previous
        if (this.selectedNode) {
            this.selectedNode.classed("selected", false);
        }

        // select new
        this.selectedNode = d3.select(event.currentTarget);
        this.selectedNode.classed("selected", true);

        // highlight connections and show sidebar
        this.highlightConnections(d);
        this.showSidebar(d);
    }

    getDragBehavior() {
        const dragstarted = (event, d) => {
            if (!event.active) this.simulation.alphaTarget(this.config.animation.dragAlpha).restart();
            // here, we tell the simulation that don't let the temperature drop below 0.3, so that the graph stays warm when dragged
            d.fx = d.x;
            d.fy = d.y;
            d3.select(event.sourceEvent.target.parentNode).classed("pinned", true);
            // .target is the <circle> that was clicked, but we need its parent <g> to apply the "pinned" class
        };

        const dragged = (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
        };

        const dragended = (event, d) => {
            if (!event.active) {
                this.simulation.alphaTarget(0);
            }
            const shouldStayPinned = this.config.interaction.pinTypes.includes(d.type);
            if (!shouldStayPinned) {
                // release ALL nodes - return to equilibrium
                d.fx = null;
                d.fy = null;
                d3.select(event.sourceEvent.target.parentNode).classed("pinned", false);
            }
        };

        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }

    handleResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // update SVG dimensions
        this.svg.attr('width', width).attr('height', height);

        // update force center
        if (this.simulation) {
            this.simulation.force('center', d3.forceCenter(width / 2, height / 2));
            this.simulation.alpha(0.3).restart();
        }
    }

    // __________________
    // SIDEBAR RENDERING
    // __________________
    showSidebar(d) {
        const sidebar = document.getElementById('sidebar');
        const content = document.getElementById('sidebar-content');

        // look up the appropriate renderer for this node type
        const renderer = sidebarRenderers[d.type];
        if (!renderer) {
            console.error(`No renderer found for type: ${d.type}`);
            return;
        }

        // render main content + connections
        const html = renderer(d) + renderConnections(this.graphData, d);
        content.innerHTML = html;
        sidebar.classList.add('active');

        // post-processing: render LaTeX for problem statements
        if (d.type === 'problem' && d.statement) {
            const mathContent = document.getElementById('math-content');
            if (mathContent) {
                renderLatex(mathContent);
            }
        }
    }

    closeSidebar() {
        document.getElementById('sidebar').classList.remove('active');
        if (this.selectedNode) {
            this.selectedNode.classed("selected", false);
            this.selectedNode = null;
        }
        this.link.classed("highlighted", false);
    }

    highlightConnections(d) {
        this.link.classed("highlighted", l =>
            l.source.id === d.id || l.target.id === d.id
        );
    }

    // _______________
    // CONTROL METHODS
    // _______________
    resetView() {
        this.simulation.alpha(1).restart();
        this.svg.transition().duration(750).call(this.zoom.transform, d3.zoomIdentity);
        this.closeSidebar();
        this.node.classed("pinned", false);
        this.graphData.nodes.forEach(d => {
            d.fx = null;
            d.fy = null;
        });
    }

    toggleLabels() {
        this.showingLabels = !this.showingLabels;
        const btn = document.getElementById('labelsBtn');

        if (this.showingLabels) {
            btn.classList.add('active');
            this.node.selectAll("text").style("opacity", 1);
        } else {
            btn.classList.remove('active');
            this.node.selectAll("text").style("opacity", null);
        }
    }

    filterByType() {
        const filters = ["contest", "problem", "field", "subfield"];
        const btn = document.getElementById('filterBtn');

        this.filterIndex = (this.filterIndex + 1) % (filters.length + 1);
        // modulo cycles from 0 to 4 where 0 = "show all" and 1-4 = each filter type

        if (this.filterIndex === 0) {
            // show all
            this.node.style("opacity", null);
            this.link.style("opacity", null);
            this.currentFilter = null;
            btn.classList.remove('active');
        } else {
            const filter = filters[this.filterIndex - 1];
            this.currentFilter = filter;
            btn.classList.add('active');

            this.node.style("opacity", d => d.type === filter ? 1 : 0.1); // the matching nodes are fully visible
            this.link.style("opacity", l =>
                (l.source.type === filter || l.target.type === filter) ? 0.8 : 0.05
            );
        }
    }
}

// INITIALIZE THE APPLICATION
const graph = new MathOlympiadGraph('#graph', 'data/data_node_link.json');

// when DOM is ready:
graph.init();

// expose control methods globally for html onclick handlers
window.resetView = () => graph.resetView();
window.toggleLabels = () => graph.toggleLabels();
window.filterByType = () => graph.filterByType();
window.closeSidebar = () => graph.closeSidebar();
