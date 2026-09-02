const GRAPH_CONFIG = {
    layout: {
        // spring rest-lengths (L) (equilibrium distance) between different node types
        distances: { 
            'contest-problem': 100,
            'problem-field': 80,
            'problem-subfield': 60,
            'default': 70
        },

        // spring stiffness k (0 = no pull, 1 = max pull)
        stiffness: {
            'contest-problem': 0.6,
            'problem-field': 0.4,
            'problem-subfield': 0.25, 
            'default': 0.2
        },

        // global repulsion between ALL nodes (negative = repel, positive = attract)
        chargeStrength: -200,

        // collision radii per type (node radius + padding)
        collision: {
            default: 10,
            contest: 25,
            field: 15,
            strength: 1,
            iterations: 2
        }
    },

    visual: {
        nodeSize: {
            contest: 10,
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

    animation: {
        initialZoomScale: 0.6,
        initialZoomDuration: 1000,
        dragAlpha: 0.3, // simulation heat during drag
        resizeDebounce: 250, // ms
    },

    // node types listed here stay pinned after drag; empty = all return to equilibrium
    interaction: {
        pinTypes: []
    }
}


const sidebarRenderers = {
    contest: (d) => `
        <h2>${d.name}</h2>
        <p class="type">CONTEST</p>
        <dl class="meta">
            <div class="meta-item">
                <dt class="meta-label">Problems</dt>
                <dd>${d.count}</dd>
            </div>
        </dl>
    `,

    problem: (d) => `
        <h2>${d.name || d.id}</h2>
        <p class="type">PROBLEM</p>
        <dl class="meta">
            <div class="meta-item">
                <dt class="meta-label">Contest</dt>
                <dd>${d.contest} ${d.year}</dd>
            </div>
            <div class="meta-item">
                <dt class="meta-label">Position</dt>
                <dd>Problem ${d.position}</dd>
            </div>
            <div class="meta-item">
                <dt class="meta-label">Host</dt>
                <dd>${d.host}</dd>
            </div>
            ${d.fields?.length ? `
                <div class="meta-item">
                    <dt class="meta-label">Fields</dt>
                    <dd>${d.fields.join(', ')}</dd>
                </div>
            ` : ''}
            ${d.subfields?.length ? `
                <div class="meta-item">
                    <dt class="meta-label">Subfields</dt>
                    <dd>${d.subfields.join(', ')}</dd>
                </div>
            ` : ''}
        </dl>
        ${d.statement ? `
            <div class="statement" id="math-content" role="region" aria-label="Problem statement">
                ${d.statement}
            </div>
        ` : ''}
        ${d.image_ref ? `
            <a
                href="${d.image_ref}"
                target="_blank"
                rel="noopener noreferrer"
                class="image-ref-link"
                aria-label="View problem image, opens in new tab"
            >
                View Problem Image →
            </a>
        ` : ''}
    `,

    field: (d) => `
        <h2>${d.name}</h2>
        <p class="type">FIELD</p>
        <dl class="meta">
            <div class="meta-item">
                <dt class="meta-label">Problems</dt>
                <dd>${d.count}</dd>
            </div>
        </dl>
    `,

    subfield: (d) => `
        <h2>${d.name}</h2>
        <p class="type">SUBFIELD</p>
        <dl class="meta">
            <div class="meta-item">
                <dt class="meta-label">Problems</dt>
                <dd>${d.count}</dd>
            </div>
        </dl>
    `,
};


// HELPER: renders connections list (shared by all node types)
function renderConnections(graphData, d) {
    const connections = graphData.links
        .filter(l => l.source.id === d.id || l.target.id === d.id)
        .map(l => {
            const target = l.source.id === d.id ? l.target : l.source;
            return `
                <li class="connection-item">
                    ${target.name || target.id}
                    <span class="connection-type" aria-label="type: ${target.type}">(${target.type})</span>
                </li>
            `;
        });

    if (connections.length === 0) return '';

    return `
        <section class="connections" aria-label="Connections">
            <p style="color:#999;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 12px 0;">
                Connections (${connections.length})
            </p>
            <ul style="list-style:none;margin:0;padding:0;">
                ${connections.join('')}
            </ul>
        </section>
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
        setTimeout(() => renderLatex(element, retries - 1), 100);
    }
}


// MAIN
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

    // INITIALIZATION
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
        document.getElementById('node-count').textContent = data.nodes.length;
        document.getElementById('edge-count').textContent = data.links.length;
    }

    initGraph() {
        const width  = window.innerWidth;
        const height = window.innerHeight;

        this.svg = d3.select(this.svgSelector)
            .attr("width", width)
            .attr("height", height);

        // inner group: zoom transforms this, leaving other UI untouched
        this.g = this.svg.append("g");

        this.zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", (event) => {
                this.g.attr("transform", event.transform);
            });

        this.svg.call(this.zoom);

        this.initSimulation(width, height);
        this.initLinks();
        this.initNodes();
        this.initInteractions();
        this.performInitialZoom(width, height);
    }

    initSimulation(width, height) {
        const cfg = this.config;

        this.simulation = d3.forceSimulation(this.graphData.nodes)
            .force("link", d3.forceLink(this.graphData.links)
                .id(d => d.id)
                .distance(d => cfg.layout.distances[d.type] || cfg.layout.distances.default)
                .strength(d => cfg.layout.stiffness[d.type] || cfg.layout.stiffness.default))
            .force("charge", d3.forceManyBody()
                .strength(cfg.layout.chargeStrength))
            .force("center", d3.forceCenter(width / 2, height / 2))
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
        this.link = this.g.append("g")
            .selectAll("line")
            .data(this.graphData.links)
            .join("line")
            .attr("class", "link");
    }

    initNodes() {
        const cfg = this.config;

        this.node = this.g.append("g")
            .selectAll("g")
            .data(this.graphData.nodes)
            .join("g")
            .attr("class", "node")
            .call(this.getDragBehavior());

        this.node.append("circle")
            .attr("r",    d => cfg.visual.nodeSize[d.type])
            .attr("fill", d => cfg.visual.nodeColor[d.type]);

        // labels: hidden by default via CSS opacity: 0
        this.node.append("text")
            .attr("dy", d => cfg.visual.nodeSize[d.type] + 14)
            .text(d => d.name || d.id);
    }

    initInteractions() {
        this.node.on("click", (event, d) => this.handleNodeClick(event, d));
        this.svg.on("click", () => this.closeSidebar());

        this.simulation.on("tick", () => {
            this.link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            this.node.attr("transform", d => `translate(${d.x},${d.y})`);
        });
    }

    performInitialZoom(width, height) {
        setTimeout(() => {
            const bounds = this.g.node().getBBox()
            const midX = bounds.x + bounds.width  / 2
            const midY = bounds.y + bounds.height / 2

            // fit graph to viewport, letterbox-style
            const scale = this.config.animation.initialZoomScale / Math.max(bounds.width / width, bounds.height / height)
            const translate = [ (width / 2) - (scale * midX), (height / 2) - (scale * midY)]
            
            this.svg.transition()
                .duration(this.config.animation.initialZoomDuration)
                .call(this.zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
        }, 100);
    }

    bindEvents() {
        // debounced resize: waits until user stops resizing before recalculating
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, this.config.animation.resizeDebounce);
        });
    }


    // INTERACTION HANDLER
    handleNodeClick(event, d) {
        event.stopPropagation();

        if (this.selectedNode) {
            this.selectedNode.classed("selected", false);
        }

        this.selectedNode = d3.select(event.currentTarget);
        this.selectedNode.classed("selected", true);

        this.highlightConnections(d);
        this.showSidebar(d);
    }

    getDragBehavior() {
        const dragstarted = (event, d) => {
            if (!event.active) this.simulation.alphaTarget(this.config.animation.dragAlpha).restart();
            d.fx = d.x;
            d.fy = d.y;
            // event.target is the <circle>; its parent <g> gets the pinned class
            d3.select(event.sourceEvent.target.parentNode).classed("pinned", true);
        };

        const dragged = (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
        };

        const dragended = (event, d) => {
            if (!event.active) this.simulation.alphaTarget(0);
            const shouldStayPinned = this.config.interaction.pinTypes.includes(d.type);
            if (!shouldStayPinned) {
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
        const width  = window.innerWidth;
        const height = window.innerHeight;
        this.svg.attr('width', width).attr('height', height);
        if (this.simulation) {
            this.simulation.force('center', d3.forceCenter(width / 2, height / 2));
            this.simulation.alpha(0.3).restart();
        }
    }

    // SIDEBAR RERENDERING
    showSidebar(d) {
        const sidebar = document.getElementById('sidebar');
        const content = document.getElementById('sidebar-content');

        const renderer = sidebarRenderers[d.type];
        if (!renderer) {
            console.error(`No renderer found for type: ${d.type}`);
            return;
        }

        content.innerHTML = renderer(d) + renderConnections(this.graphData, d);
        sidebar.classList.add('active');

        // render LaTeX for problem statements after HTML is injected
        if (d.type === 'problem' && d.statement) {
            const mathContent = document.getElementById('math-content');
            if (mathContent) renderLatex(mathContent);
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


    // CONTROL METHOD
    resetView() {
        this.simulation.alpha(1).restart();
        this.svg.transition().duration(750).call(this.zoom.transform, d3.zoomIdentity);
        this.closeSidebar();
        this.node.classed("pinned", false);
        this.graphData.nodes.forEach(d => { d.fx = null; d.fy = null; });
    }

    toggleLabels() {
        this.showingLabels = !this.showingLabels;
        const btn = document.getElementById('labelsBtn');
        btn.setAttribute('aria-pressed', this.showingLabels);
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

        // modulo cycles from 0 to 4 where 0 = "show all" and 1-4 = each filter type
        this.filterIndex = (this.filterIndex + 1) % (filters.length + 1);
        btn.setAttribute('aria-pressed', this.filterIndex !== 0)

        if (this.filterIndex === 0) {
            this.node.style("opacity", null);
            this.link.style("opacity", null);
            this.currentFilter = null;
            btn.classList.remove('active');
        } else {
            const filter = filters[this.filterIndex - 1];
            this.currentFilter = filter;
            btn.classList.add('active');
            this.node.style("opacity", d => d.type === filter ? 1 : 0.1);
            this.link.style("opacity", l =>
                (l.source.type === filter || l.target.type === filter) ? 0.8 : 0.05
            );
        }
    }
}

const graph = new MathOlympiadGraph('#graph', 'data/data_node_link.json');
graph.init();

// expose control methods for HTML onclick handlers
window.resetView    = () => graph.resetView();
window.toggleLabels = () => graph.toggleLabels();
window.filterByType = () => graph.filterByType();
window.closeSidebar = () => graph.closeSidebar();