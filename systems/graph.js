import { loadJSON } from './jsonLoader.js';

let cachedLegacyGraph = null;

function normalizeConnections(entries = []) {
  return entries.map((entry) => {
    if (typeof entry === 'string') {
      return { id: entry, distance: 1, rough: false, roughness: 1, hazard: 0.15, label: null };
    }
    const distance = typeof entry.distance === 'number' ? entry.distance : 1;
    const roughness = typeof entry.roughness === 'number'
      ? entry.roughness
      : entry.rough
        ? 1.3
        : 1;
    const hazard = typeof entry.hazard === 'number' ? entry.hazard : entry.rough ? 0.45 : 0.2;
    return {
      id: entry.id,
      distance,
      rough: Boolean(entry.rough || roughness > 1.15),
      roughness,
      hazard,
      label: entry.label || null
    };
  });
}

export async function loadLegacyGraph() {
  if (cachedLegacyGraph) {
    return cachedLegacyGraph;
  }
  const data = await loadJSON('../data/nodes.json');
  const nodes = new Map();
  const edges = [];
  const list = Array.isArray(data.nodes) ? data.nodes : [];
  list.forEach((node) => {
    const connections = normalizeConnections(node.connections || node.neighbors || []);
    const normalized = { ...node, connections };
    nodes.set(node.id, normalized);
  });
  nodes.forEach((node) => {
    node.connections.forEach((connection) => {
      edges.push({ from: node.id, to: connection.id });
    });
  });
  cachedLegacyGraph = {
    start: data.start || list[0]?.id || 'halifax-hub',
    nodes,
    edges
  };
  return cachedLegacyGraph;
}

export const loadGraph = loadLegacyGraph;

export function getConnections(graph, nodeId) {
  const node = graph?.nodes?.get ? graph.nodes.get(nodeId) : null;
  if (!node) {
    return [];
  }
  return node.connections
    .map((link) => ({
      node: graph.nodes.get(link.id),
      link
    }))
    .filter((entry) => Boolean(entry.node));
}
