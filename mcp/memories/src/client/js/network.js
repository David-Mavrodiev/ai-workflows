import { getNetwork } from './api.js';
import { getSectionColor } from './sections.js';
import { showDetail } from './detail.js';

let simulation = null;
let highlightedNode = null;

// Module-level D3 selections for external access (filtering)
let nodeSelection = null;
let linkSelection = null;
let labelSelection = null;
let graphNodes = null;
let graphLinks = null;

export function isNetworkOpen() {
  const panel = document.getElementById('network-panel');
  return panel && !panel.classList.contains('hidden');
}

export function filterBySection(sectionId) {
  if (!nodeSelection || !linkSelection || !labelSelection) return;

  if (!sectionId) {
    // Reset: show all
    nodeSelection.attr('opacity', 1);
    linkSelection.attr('opacity', 0.6);
    labelSelection.attr('opacity', 0);
    highlightedNode = null;
    return;
  }

  // Find nodes in this section and their connected neighbors
  const sectionNodeIds = new Set();
  nodeSelection.each(function (d) {
    if (d.section === sectionId) sectionNodeIds.add(d.id);
  });

  const visibleIds = new Set(sectionNodeIds);
  for (const id of sectionNodeIds) {
    const connected = getConnectedIds(id, graphLinks, graphNodes);
    for (const cid of connected) visibleIds.add(cid);
  }

  nodeSelection.attr('opacity', n => visibleIds.has(n.id) ? 1 : 0.08);
  labelSelection.attr('opacity', n => sectionNodeIds.has(n.id) ? 1 : 0);
  linkSelection.attr('opacity', l => {
    const srcId = typeof l.source === 'object' ? l.source.id : l.source;
    const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
    return (visibleIds.has(srcId) && visibleIds.has(tgtId)) ? 0.6 : 0.03;
  });
}

export function initNetwork() {
  document.getElementById('network-toggle').addEventListener('click', toggleNetwork);
  document.getElementById('network-close').addEventListener('click', closeNetwork);
}

function toggleNetwork() {
  const networkPanel = document.getElementById('network-panel');
  const tilesPanel = document.getElementById('tiles-panel');
  const detailPanel = document.getElementById('detail-panel');

  if (networkPanel.classList.contains('hidden')) {
    // Close settings if open
    document.getElementById('settings-panel').classList.add('hidden');
    // Show sections, hide tiles+detail, show network
    document.getElementById('sections-panel').classList.remove('hidden');
    tilesPanel.classList.add('hidden');
    detailPanel.classList.add('hidden');
    networkPanel.classList.remove('hidden');
    loadNetwork();
  } else {
    closeNetwork();
  }
}

function closeNetwork() {
  const networkPanel = document.getElementById('network-panel');
  networkPanel.classList.add('hidden');
  networkPanel.classList.remove('flyout-open');
  document.getElementById('network-flyout').classList.add('hidden');
  document.getElementById('sections-panel').classList.remove('hidden');
  document.getElementById('tiles-panel').classList.remove('hidden');
  document.getElementById('detail-panel').classList.remove('hidden');
  if (simulation) { simulation.stop(); simulation = null; }
  nodeSelection = null;
  linkSelection = null;
  labelSelection = null;
  graphNodes = null;
  graphLinks = null;
}

async function loadNetwork() {
  const container = document.getElementById('network-container');
  container.innerHTML = '';

  try {
    const data = await getNetwork();
    const nodes = (data.nodes || []).map(n => ({ ...n }));
    const links = (data.links || data.edges || []).map(l => ({
      source: l.source || l.from,
      target: l.target || l.to,
      type: l.type || 'auto',
    }));

    if (nodes.length === 0) {
      container.innerHTML = '<div class="tiles-empty"><p>No memories to display in network</p></div>';
      return;
    }

    renderGraph(container, nodes, links);
  } catch (e) {
    container.innerHTML = `<div class="tiles-empty"><p>Error: ${e.message}</p></div>`;
  }
}

function renderGraph(container, nodes, links) {
  graphNodes = nodes;
  graphLinks = links;

  const rect = container.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;

  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g');

  // Zoom
  svg.call(d3.zoom().scaleExtent([0.2, 5]).on('zoom', (event) => {
    g.attr('transform', event.transform);
  }));

  // Links
  const link = g.append('g').selectAll('line')
    .data(links).enter().append('line')
    .attr('class', d => `net-link ${d.type}`)
    .attr('stroke', '#999')
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', d => d.type === 'auto' ? '5,5' : 'none');

  // Nodes
  const node = g.append('g').selectAll('circle')
    .data(nodes).enter().append('circle')
    .attr('class', 'net-node')
    .attr('r', 8)
    .attr('fill', d => getSectionColor(d.section))
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.5)
    .call(d3.drag()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded));

  // Labels — hidden by default
  const label = g.append('g').selectAll('text')
    .data(nodes).enter().append('text')
    .attr('class', 'net-label')
    .attr('dx', 12).attr('dy', 4)
    .attr('font-size', '11px')
    .attr('fill', 'var(--text-primary)')
    .attr('opacity', 0)
    .text(d => d.title?.substring(0, 25) || 'Untitled');

  // Store selections at module level
  nodeSelection = node;
  linkSelection = link;
  labelSelection = label;

  // Click behavior — select node, show only its label, open flyout
  node.on('click', (event, d) => {
    event.stopPropagation();

    highlightedNode = d.id;
    const connected = getConnectedIds(d.id, links, nodes);
    connected.add(d.id);

    node.attr('opacity', n => connected.has(n.id) ? 1 : 0.15);
    // Only show label for the clicked node itself
    label.attr('opacity', n => n.id === d.id ? 1 : 0);
    link.attr('opacity', l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      return (srcId === d.id || tgtId === d.id) ? 1 : 0.05;
    });

    // Show flyout
    const flyout = document.getElementById('network-flyout');
    const networkPanel = document.getElementById('network-panel');
    flyout.classList.remove('hidden');
    networkPanel.classList.add('flyout-open');
    showDetail(d.id, 'network-flyout-content');
  });

  // Double-click to navigate
  node.on('dblclick', (event, d) => {
    event.stopPropagation();
    closeNetwork();
    showDetail(d.id);
    highlightedNode = null;
  });

  svg.on('click', () => {
    highlightedNode = null;
    node.attr('opacity', 1);
    label.attr('opacity', 0);
    link.attr('opacity', 0.6);

    // Hide flyout
    const flyout = document.getElementById('network-flyout');
    const networkPanel = document.getElementById('network-panel');
    flyout.classList.add('hidden');
    networkPanel.classList.remove('flyout-open');
  });

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(20))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('cx', d => d.x).attr('cy', d => d.y);
      label.attr('x', d => d.x).attr('y', d => d.y);
    });

  function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x; d.fy = event.y;
  }
  function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
  }
}

function getConnectedIds(nodeId, links, nodes) {
  const ids = new Set();
  for (const l of links) {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (src === nodeId) ids.add(tgt);
    if (tgt === nodeId) ids.add(src);
  }
  return ids;
}
