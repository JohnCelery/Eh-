import { loadJSON } from './jsonLoader.js';

let cachedGraph = null;

function normalizeConnections(entries = []) {
  return entries.map((entry) => {
    if (typeof entry === 'string') {
      return { id: entry, distance: 1, rough: false };
    }
    return {
      id: entry.id,
      distance: typeof entry.distance === 'number' ? entry.distance : 1,
      rough: Boolean(entry.rough),
      label: entry.label || null
    };
  });
}

export async function loadGraph() {
  if (cachedGraph) {
    return cachedGraph;
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
  cachedGraph = {
    start: data.start || list[0]?.id || 'halifax-hub',
    nodes,
    edges
  };
  return cachedGraph;
}

export function getConnections(graph, nodeId) {
  const node = graph.nodes.get(nodeId);
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
