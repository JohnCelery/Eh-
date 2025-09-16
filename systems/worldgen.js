import { loadJSON } from './jsonLoader.js';
import { RNG, deriveSeed } from './rng.js';

const WORLD_DATA_PATH = '../data/world.json';

let cachedConfig = null;

const KIND_LIBRARY = {
  checkpoint: {
    actions: ['shop', 'tinker'],
    baseYields: {
      gas: [2, 5],
      snacks: [2, 6],
      ride: [2, 4],
      money: [2, 5]
    },
    abundanceRange: [0.5, 0.75],
    prosperityRange: [0.55, 0.8],
    maintenanceRange: [0.6, 0.9],
    hazardRange: [0.08, 0.18],
    roughnessRange: [0.9, 1.05],
    services: { mechanic: true, shop: true },
    shopCostRange: [3, 5]
  },
  gas: {
    actions: ['siphon', 'scavenge'],
    baseYields: {
      gas: [2, 6],
      snacks: [0, 2],
      ride: [0, 2],
      money: [1, 4]
    },
    abundanceRange: [0.45, 0.85],
    prosperityRange: [0.2, 0.5],
    maintenanceRange: [0.25, 0.45],
    hazardRange: [0.15, 0.32],
    roughnessRange: [0.95, 1.15],
    services: {}
  },
  forest: {
    actions: ['forage', 'scavenge'],
    baseYields: {
      gas: [0, 2],
      snacks: [2, 6],
      ride: [1, 3],
      money: [0, 2]
    },
    abundanceRange: [0.5, 0.9],
    prosperityRange: [0.1, 0.4],
    maintenanceRange: [0.35, 0.55],
    hazardRange: [0.18, 0.42],
    roughnessRange: [1.05, 1.3],
    services: {}
  },
  mechanic: {
    actions: ['tinker', 'scavenge'],
    baseYields: {
      gas: [0, 3],
      snacks: [0, 3],
      ride: [2, 6],
      money: [1, 3]
    },
    abundanceRange: [0.3, 0.55],
    prosperityRange: [0.35, 0.6],
    maintenanceRange: [0.65, 0.95],
    hazardRange: [0.12, 0.28],
    roughnessRange: [0.95, 1.2],
    services: { mechanic: true },
    shopCostRange: [3, 5]
  },
  town: {
    actions: ['shop', 'tinker'],
    baseYields: {
      gas: [1, 5],
      snacks: [2, 6],
      ride: [1, 3],
      money: [2, 6]
    },
    abundanceRange: [0.45, 0.7],
    prosperityRange: [0.4, 0.8],
    maintenanceRange: [0.45, 0.7],
    hazardRange: [0.08, 0.22],
    roughnessRange: [0.9, 1.1],
    services: { mechanic: true, shop: true },
    shopCostRange: [3, 6]
  },
  ferry: {
    actions: ['ferry', 'shop'],
    baseYields: {
      gas: [0, 2],
      snacks: [1, 4],
      ride: [2, 5],
      money: [1, 3]
    },
    abundanceRange: [0.35, 0.6],
    prosperityRange: [0.45, 0.75],
    maintenanceRange: [0.55, 0.8],
    hazardRange: [0.05, 0.18],
    roughnessRange: [0.85, 1.05],
    services: { ferry: true, shop: true },
    ferryCostRange: [3, 6],
    shopCostRange: [3, 5]
  },
  ghost: {
    actions: ['scavenge', 'siphon'],
    baseYields: {
      gas: [1, 5],
      snacks: [0, 2],
      ride: [0, 2],
      money: [1, 4]
    },
    abundanceRange: [0.25, 0.55],
    prosperityRange: [0.1, 0.35],
    maintenanceRange: [0.2, 0.45],
    hazardRange: [0.35, 0.75],
    roughnessRange: [1.1, 1.45],
    services: {}
  },
  vista: {
    actions: ['forage', 'scavenge'],
    baseYields: {
      gas: [0, 2],
      snacks: [1, 4],
      ride: [1, 4],
      money: [0, 3]
    },
    abundanceRange: [0.35, 0.65],
    prosperityRange: [0.25, 0.55],
    maintenanceRange: [0.45, 0.75],
    hazardRange: [0.1, 0.32],
    roughnessRange: [0.9, 1.2],
    services: { shop: false }
  }
};

const NAME_PARTS = {
  gas: {
    prefixes: ['Prairie', 'Twin Pines', 'Maple Leaf', 'Aurora', 'Polar', 'Sundog', 'Blueberry', 'Totem'],
    suffixes: ['Fuel Stop', 'Gas Co-op', 'Service', 'Pump Row', 'Fuel Depot', 'Roadhouse']
  },
  forest: {
    prefixes: ['Whispering', 'Moosejaw', 'Snowberry', 'Birch Ridge', 'Skyline', 'Trout Lake', 'Cedar Grove', 'Windrift'],
    suffixes: ['Backcountry', 'Provincial Park', 'Trailhead', 'Woodlot', 'Bog', 'Reserve']
  },
  mechanic: {
    prefixes: ['Rusty', 'Frontier', 'High Gear', 'Prairie', 'Snowcap', 'True North', 'Frostbite'],
    suffixes: ['Garage', 'Repair Yard', 'Workshop', 'Tune-Up', 'Motor Shed', 'Pit Stop']
  },
  town: {
    prefixes: ['Friendly', 'Summit', 'Maple Ridge', 'Twin Lakes', 'Aurora', 'Canyon', 'Prairie Light'],
    suffixes: ['Trading Post', 'Township', 'Market', 'Crossing', 'Village', 'Harbour']
  },
  ferry: {
    prefixes: ['Silver', 'Lakeline', 'Twin Current', 'North Star', 'Baylight', 'Cedar', 'Salish'],
    suffixes: ['Ferry', 'Crossing', 'Passage', 'Pontoon', 'Causeway', 'Jetty']
  },
  ghost: {
    prefixes: ['Abandoned', 'Fog Hollow', 'Stormcell', 'Rusted', 'Coyote', 'Shadow', 'Grim Cedar'],
    suffixes: ['Service Road', 'Ghost Town', 'Rest Stop', 'Storm Cell', 'Empty Lot', 'Drift']
  },
  vista: {
    prefixes: ['Sunset', 'Aurora', 'Eagle Eye', 'Skyline', 'Prairie Light', 'Glacial', 'Rainshadow'],
    suffixes: ['Vista', 'Lookout', 'Rest', 'Scenic Pullout', 'Overlook', 'Summit']
  }
};

const SEGMENT_KIND_POOL = [
  'forest',
  'gas',
  'town',
  'mechanic',
  'forest',
  'vista',
  'ghost',
  'gas',
  'ferry',
  'forest',
  'town'
];

const BRANCH_KIND_POOL = ['ghost', 'vista', 'gas', 'forest', 'ghost', 'ferry'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function ensureConfig(config) {
  if (!config || !Array.isArray(config.checkpoints) || config.checkpoints.length === 0) {
    throw new Error('World configuration missing checkpoints');
  }
  return config;
}

function scaleRange([minBase = 0, maxBase = 0], factor) {
  const min = Math.max(0, Math.round(lerp(minBase, (minBase + maxBase) / 2, factor * 0.6)));
  const span = Math.max(0, maxBase - minBase);
  const projectedMax = minBase + span * (0.4 + factor * 0.6);
  const max = Math.max(min, Math.round(projectedMax));
  return { min, max };
}

function buildProfile(kindKey, rng) {
  const template = KIND_LIBRARY[kindKey] || KIND_LIBRARY.forest;
  const abundance = rng.nextRange(template.abundanceRange[0], template.abundanceRange[1]);
  const prosperity = rng.nextRange(template.prosperityRange[0], template.prosperityRange[1]);
  const maintenance = rng.nextRange(template.maintenanceRange[0], template.maintenanceRange[1]);
  const hazard = rng.nextRange(template.hazardRange[0], template.hazardRange[1]);
  const roughness = rng.nextRange(template.roughnessRange[0], template.roughnessRange[1]);
  const yields = {
    gas: scaleRange(template.baseYields.gas, abundance),
    snacks: scaleRange(template.baseYields.snacks, abundance),
    ride: scaleRange(template.baseYields.ride, maintenance),
    money: scaleRange(template.baseYields.money, prosperity)
  };
  const services = { ...(template.services || {}) };
  if (services.shop) {
    const [minCost = 3, maxCost = 6] = template.shopCostRange || [3, 6];
    services.shopCost = lerp(minCost, maxCost, prosperity);
  }
  if (services.ferry) {
    const [minCost = 3, maxCost = 6] = template.ferryCostRange || [3, 6];
    services.ferryCost = lerp(minCost, maxCost, prosperity);
  }
  return {
    abundance,
    prosperity,
    maintenance,
    hazard,
    roughness,
    yields,
    services
  };
}

function createShortName(name) {
  if (!name) {
    return '';
  }
  if (name.length <= 16) {
    return name;
  }
  const parts = name.split(' ');
  if (parts.length === 1) {
    return parts[0].slice(0, 14);
  }
  const candidate = `${parts[0]} ${parts[1]}`;
  if (candidate.length <= 16) {
    return candidate;
  }
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 6)}`.trim();
}

function buildName(kind, rng) {
  const parts = NAME_PARTS[kind];
  if (!parts) {
    return null;
  }
  const prefix = parts.prefixes[rng.nextInt(0, parts.prefixes.length - 1)];
  const suffix = parts.suffixes[rng.nextInt(0, parts.suffixes.length - 1)];
  return `${prefix} ${suffix}`;
}

function createNode({ id, kind, coords, region, rng }) {
  const template = KIND_LIBRARY[kind] || KIND_LIBRARY.forest;
  const profile = buildProfile(kind, rng);
  const name = buildName(kind, rng) || `${kind} waypoint`;
  return {
    id,
    kind,
    name,
    shortName: createShortName(name),
    coords: {
      x: Number(coords.x.toFixed(2)),
      y: Number(coords.y.toFixed(2))
    },
    region,
    actions: [...new Set(template.actions || [])],
    profile,
    connections: []
  };
}

function addConnection(node, target, data) {
  if (!node.connections) {
    node.connections = [];
  }
  const exists = node.connections.some((entry) => entry.id === target.id);
  if (exists) {
    return;
  }
  node.connections.push({
    id: target.id,
    distance: Number(data.distance.toFixed(2)),
    roughness: Number(data.roughness.toFixed(3)),
    rough: data.rough,
    hazard: Number(data.hazard.toFixed(3))
  });
}

function averageHazard(nodeA, nodeB) {
  const a = nodeA.profile?.hazard ?? 0.2;
  const b = nodeB.profile?.hazard ?? 0.2;
  return (a + b) / 2;
}

function averageRoughness(nodeA, nodeB) {
  const a = nodeA.profile?.roughness ?? 1;
  const b = nodeB.profile?.roughness ?? 1;
  return (a + b) / 2;
}

function computeDistance(nodeA, nodeB) {
  const dx = nodeB.coords.x - nodeA.coords.x;
  const dy = nodeB.coords.y - nodeA.coords.y;
  const distance = Math.hypot(dx, dy);
  const scaled = distance / 12;
  return Math.max(0.6, scaled);
}

function connectBidirectional(nodeA, nodeB) {
  const distance = computeDistance(nodeA, nodeB);
  const roughness = averageRoughness(nodeA, nodeB);
  const hazard = averageHazard(nodeA, nodeB);
  const rough = roughness > 1.15;
  addConnection(nodeA, nodeB, { distance, roughness, hazard, rough });
  addConnection(nodeB, nodeA, { distance, roughness, hazard, rough });
}

function pickKindForSegment(rng) {
  return SEGMENT_KIND_POOL[rng.nextInt(0, SEGMENT_KIND_POOL.length - 1)];
}

function pickKindForBranch(rng) {
  return BRANCH_KIND_POOL[rng.nextInt(0, BRANCH_KIND_POOL.length - 1)];
}

function buildEdges(nodes) {
  const edges = [];
  nodes.forEach((node) => {
    (node.connections || []).forEach((connection) => {
      edges.push({ from: node.id, to: connection.id });
    });
  });
  return edges;
}

export async function loadWorldConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }
  const data = await loadJSON(WORLD_DATA_PATH);
  cachedConfig = ensureConfig(data);
  return cachedConfig;
}

export async function generateWorldGraph({ baseSeed }) {
  const config = await loadWorldConfig();
  const worldVersion = Number(config.worldVersion) || 1;
  const checkpoints = config.checkpoints.map((entry) => ({ ...entry }));
  const rng = new RNG(deriveSeed(baseSeed, 'world', worldVersion));
  const nodes = new Map();

  checkpoints.forEach((checkpoint, index) => {
    const base = KIND_LIBRARY.checkpoint;
    const profileRng = new RNG(deriveSeed(baseSeed, 'checkpoint', checkpoint.id, index));
    const profile = buildProfile('checkpoint', profileRng);
    const node = {
      id: checkpoint.id,
      kind: 'checkpoint',
      name: checkpoint.name,
      shortName: checkpoint.shortName || createShortName(checkpoint.name),
      coords: {
        x: Number((checkpoint.coords?.x ?? 0).toFixed(2)),
        y: Number((checkpoint.coords?.y ?? 0).toFixed(2))
      },
      region: checkpoint.region || 'Canada',
      actions: checkpoint.actions ? [...new Set(checkpoint.actions)] : [...base.actions],
      profile: {
        ...profile,
        services: {
          ...profile.services,
          ...(checkpoint.services || {})
        }
      },
      connections: []
    };
    nodes.set(node.id, node);
  });

  let globalCounter = 0;

  for (let segmentIndex = 0; segmentIndex < checkpoints.length - 1; segmentIndex += 1) {
    const startCheckpoint = checkpoints[segmentIndex];
    const endCheckpoint = checkpoints[segmentIndex + 1];
    const startNode = nodes.get(startCheckpoint.id);
    const endNode = nodes.get(endCheckpoint.id);
    if (!startNode || !endNode) {
      continue;
    }

    const mainCount = rng.nextInt(2, 5);
    const mainNodes = [];
    const dirX = endNode.coords.x - startNode.coords.x;
    const dirY = endNode.coords.y - startNode.coords.y;
    const length = Math.hypot(dirX, dirY) || 1;
    const norm = { x: dirX / length, y: dirY / length };
    const perp = { x: -norm.y, y: norm.x };

    for (let index = 1; index <= mainCount; index += 1) {
      const t = index / (mainCount + 1);
      const baseX = lerp(startNode.coords.x, endNode.coords.x, t);
      const baseY = lerp(startNode.coords.y, endNode.coords.y, t);
      const lateralScale = length * 0.35 + 3;
      const lateralOffset = (rng.nextFloat() - 0.5) * lateralScale;
      const forwardOffset = (rng.nextFloat() - 0.5) * 3;
      let x = baseX + perp.x * lateralOffset + norm.x * forwardOffset;
      let y = baseY + perp.y * lateralOffset + norm.y * forwardOffset;
      const minX = Math.min(startNode.coords.x, endNode.coords.x) - 4;
      const maxX = Math.max(startNode.coords.x, endNode.coords.x) + 4;
      x = clamp(x, minX, maxX);
      y = clamp(y, 8, 92);
      const kind = pickKindForSegment(rng);
      const region = t < 0.5 ? startNode.region : endNode.region;
      const nodeId = `${startNode.id}-${endNode.id}-mid-${segmentIndex}-${index}-${globalCounter++}`;
      const node = createNode({ id: nodeId, kind, coords: { x, y }, region, rng });
      nodes.set(node.id, node);
      mainNodes.push(node);
    }

    const pathNodes = [startNode, ...mainNodes, endNode];
    for (let index = 0; index < pathNodes.length - 1; index += 1) {
      connectBidirectional(pathNodes[index], pathNodes[index + 1]);
    }

    if (pathNodes.length > 2) {
      const maxBranches = Math.min(2, pathNodes.length - 1);
      const branchCount = rng.nextInt(1, Math.max(1, maxBranches));
      for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
        const baseIndex = rng.nextInt(1, pathNodes.length - 2);
        const reconnectIndex = Math.min(pathNodes.length - 1, baseIndex + rng.nextInt(1, 2));
        if (reconnectIndex === baseIndex) {
          continue;
        }
        const anchor = pathNodes[baseIndex];
        const reconnect = pathNodes[reconnectIndex];
        const branchLength = rng.nextInt(1, 2);
        let previous = anchor;
        for (let step = 1; step <= branchLength; step += 1) {
          const t = step / (branchLength + 1);
          const midX = lerp(anchor.coords.x, reconnect.coords.x, t);
          const midY = lerp(anchor.coords.y, reconnect.coords.y, t);
          const lateralDirection = rng.nextFloat() < 0.5 ? -1 : 1;
          const offsetMagnitude = (rng.nextFloat() * 0.6 + 0.4) * length * 0.6;
          let x = midX + perp.x * offsetMagnitude * lateralDirection;
          let y = midY + perp.y * offsetMagnitude * lateralDirection;
          const minBranchX = Math.min(startNode.coords.x, endNode.coords.x) - 6;
          const maxBranchX = Math.max(startNode.coords.x, endNode.coords.x) + 6;
          x = clamp(x, minBranchX, maxBranchX);
          y = clamp(y, 6, 94);
          const kind = pickKindForBranch(rng);
          const nodeId = `${anchor.id}-spur-${segmentIndex}-${branchIndex}-${step}-${globalCounter++}`;
          const node = createNode({ id: nodeId, kind, coords: { x, y }, region: anchor.region, rng });
          nodes.set(node.id, node);
          connectBidirectional(previous, node);
          previous = node;
        }
        connectBidirectional(previous, reconnect);
      }
    }
  }

  const edges = buildEdges(nodes);

  return {
    version: worldVersion,
    seed: baseSeed,
    start: checkpoints[0].id,
    nodes,
    edges,
    checkpoints: checkpoints.map((entry) => entry.id)
  };
}
