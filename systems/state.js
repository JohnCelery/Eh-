import { RNG } from './rng.js';
import { loadLegacyGraph } from './graph.js';
import { generateWorldGraph } from './worldgen.js';
import { computeActionPreview, getActionDefinition, rollActionOutcome } from './nodeActions.js';
import { maybeTriggerTravelEncounter } from './travelEncounters.js';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

const defaultStorage = typeof window !== 'undefined' && window.localStorage
  ? window.localStorage
  : createMemoryStorage();

const CURRENT_STATE_VERSION = 2;
const TIME_SEGMENTS = ['Morning', 'Midday', 'Evening', 'Night'];

export const VEHICLES = [
  {
    id: 'minivan',
    name: 'Prairie Minivan',
    description: 'Balanced and comfortable. Plenty of cup holders and a trusty VHS player.',
    stats: { gas: 8, snacks: 6, ride: 7, money: 60 },
    traits: ['Balanced consumption', 'Family-friendly'],
    efficiency: 1
  },
  {
    id: 'pickup',
    name: 'Northern Pickup',
    description: 'Rugged and ready for rough gravel. A little thirsty on fuel.',
    stats: { gas: 7, snacks: 5, ride: 9, money: 40 },
    traits: ['Heavy-duty suspension', 'Extra gear rack'],
    efficiency: 1.15
  },
  {
    id: 'schoolbus',
    name: 'Retro School Bus',
    description: 'Converted bus with bunks. Slow, but everyone gets elbow room.',
    stats: { gas: 6, snacks: 9, ride: 8, money: 80 },
    traits: ['Huge snack pantry', 'Neighborhood legend'],
    efficiency: 1.25
  }
];

export const DEFAULT_PARTY = [
  {
    name: 'Merri-Ellen',
    role: 'Trip captain',
    health: 5,
    status: 'Ready',
    profile: { familyRole: 'mom' }
  },
  {
    name: 'Mike',
    role: 'Wheelman',
    health: 5,
    status: 'Ready',
    profile: { familyRole: 'dad' }
  },
  {
    name: 'Ros',
    role: 'Trail spotter',
    health: 5,
    status: 'Ready',
    profile: { familyRole: 'daughter', age: 9 }
  },
  {
    name: 'Jess',
    role: 'Snack scout',
    health: 5,
    status: 'Ready',
    profile: { familyRole: 'daughter', age: 6 }
  },
  {
    name: 'Martha',
    role: 'Morale booster',
    health: 5,
    status: 'Ready',
    profile: { familyRole: 'daughter', age: 3 }
  },
  {
    name: 'Rusty',
    role: 'Naptime mascot',
    health: 5,
    status: 'Ready',
    profile: { familyRole: 'son', age: 0 }
  }
];

function instantiateDefaultParty() {
  return DEFAULT_PARTY.map((member) => {
    const { profile, ...rest } = member;
    const clone = {
      health: 5,
      status: 'Ready',
      ...rest
    };
    if (profile) {
      clone.profile = { ...profile };
    }
    return clone;
  });
}

const LOG_LIMIT = 40;

function computeVehicleEfficiency(vehicle) {
  if (!vehicle) {
    return 1;
  }
  if (typeof vehicle.efficiency === 'number') {
    return vehicle.efficiency;
  }
  return 1;
}

function formatTimestamp(state) {
  const day = state?.day ?? 1;
  const segmentIndex = state?.timeSegment ?? 0;
  const label = TIME_SEGMENTS[segmentIndex % TIME_SEGMENTS.length];
  return label ? `[Day ${day} • ${label}]` : `[Day ${day}]`;
}

export class GameState {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'canadian-trail-save';
    this.storage = options.storage || defaultStorage;
    this.state = null;
    this.rng = null;
    this.worldGraph = null;
  }

  async initialize() {
    const saved = this._load();
    if (saved) {
      this.state = saved;
      const rngState = saved.rngState ?? saved.seed;
      this.rng = new RNG(saved.seed, rngState);
      this._migrateState();
      await this._ensureWorldGraph();
      this._syncRng();
      this._persist();
    }
  }

  hasActiveSave() {
    return Boolean(this.state);
  }

  async startNewRun({ seed, vehicleId } = {}) {
    const vehicle = VEHICLES.find((entry) => entry.id === vehicleId) || VEHICLES[0];
    const resolvedSeed = Number.isInteger(seed) ? seed : Math.floor(Number(seed) || Date.now());
    this.rng = new RNG(resolvedSeed);
    const resources = {
      gas: vehicle.stats.gas,
      snacks: vehicle.stats.snacks,
      ride: vehicle.stats.ride,
      money: vehicle.stats.money
    };
    const maxResources = { ...resources };
    const roster = instantiateDefaultParty();

    this.state = {
      version: CURRENT_STATE_VERSION,
      seed: resolvedSeed,
      rngState: this.rng.serialize().state,
      day: 1,
      timeSegment: 0,
      vehicle: {
        id: vehicle.id,
        name: vehicle.name,
        traits: vehicle.traits,
        description: vehicle.description,
        efficiency: computeVehicleEfficiency(vehicle)
      },
      resources,
      maxResources,
      party: roster,
      log: [],
      location: null,
      visited: [],
      knowledge: {},
      actionHistory: {},
      flags: {
        gameOver: false
      },
      world: {
        seed: resolvedSeed,
        version: null,
        type: 'generated'
      }
    };

    await this._ensureWorldGraph({ regenerate: true });

    const startNode = this.worldGraph?.nodes?.get(this.state.location);
    const startName = startNode?.name || 'Halifax Harbour';
    this.appendLog(`Packed the cooler, topped up the tank, ready to roll from ${startName}!`);
  }

  getSnapshot() {
    if (!this.state) {
      return null;
    }
    if (typeof structuredClone === 'function') {
      return structuredClone(this.state);
    }
    return JSON.parse(JSON.stringify(this.state));
  }

  appendLog(entry) {
    if (!this.state) {
      return;
    }
    const stamped = `${formatTimestamp(this.state)} ${entry}`;
    this.state.log.push(stamped);
    if (this.state.log.length > LOG_LIMIT) {
      this.state.log.splice(0, this.state.log.length - LOG_LIMIT);
    }
    this._persist();
  }

  async ensureWorldReady() {
    await this._ensureWorldGraph();
    return this.worldGraph;
  }

  getWorldGraph() {
    return this.worldGraph;
  }

  getTravelEstimate(fromId, toId) {
    if (!this.worldGraph) {
      return null;
    }
    const fromNode = this.worldGraph.nodes.get(fromId);
    const toNode = this.worldGraph.nodes.get(toId);
    if (!fromNode || !toNode) {
      return null;
    }
    const connection = fromNode.connections?.find((entry) => entry.id === toId);
    if (!connection) {
      return null;
    }
    const distance = typeof connection.distance === 'number' ? connection.distance : 1;
    const roughness = typeof connection.roughness === 'number' ? connection.roughness : connection.rough ? 1.3 : 1;
    const hazard = Math.max(0, Math.min(1, typeof connection.hazard === 'number' ? connection.hazard : 0.25));
    const efficiency = this.state?.vehicle?.efficiency ?? 1;
    const gasCost = Math.max(1, Math.round(distance * efficiency * roughness));
    const snackCost = 1;
    const rideMax = hazard > 0.75 ? 3 : hazard > 0.5 ? 2 : hazard > 0.25 ? 1 : 0;
    return {
      from: fromNode,
      to: toNode,
      connection,
      distance,
      roughness,
      hazard,
      gasCost,
      snackCost,
      timeCost: 1,
      rideRange: { min: 0, max: rideMax }
    };
  }

  getActionOptions(nodeId) {
    if (!this.worldGraph) {
      return [];
    }
    const node = this.worldGraph.nodes.get(nodeId);
    if (!node || !Array.isArray(node.actions)) {
      return [];
    }
    return node.actions.map((actionId) => {
      const definition = getActionDefinition(actionId);
      const preview = computeActionPreview(node, actionId);
      const history = this.state?.actionHistory?.[nodeId]?.[actionId] ?? 0;
      const costs = Array.isArray(preview?.costs) ? preview.costs : [];
      let available = true;
      let reason = '';
      if (history > 0) {
        available = false;
        reason = 'Already completed.';
      }
      if (available) {
        const missing = costs.find((cost) => {
          const amount = typeof cost.amount === 'number' ? cost.amount : cost.min ?? 0;
          const resourceValue = this.state?.resources?.[cost.resource];
          return typeof resourceValue === 'number' && resourceValue < amount;
        });
        if (missing) {
          available = false;
          reason = `Need more ${missing.resource}.`;
        }
      }
      return {
        id: actionId,
        definition,
        preview,
        available,
        reason,
        used: history > 0
      };
    });
  }

  performNodeAction(actionId) {
    if (!this.state || this.state.flags.gameOver) {
      return { ok: false, reason: 'Journey complete.' };
    }
    if (!this.worldGraph) {
      return { ok: false, reason: 'Map not ready yet.' };
    }
    const nodeId = this.state.location;
    const node = this.worldGraph.nodes.get(nodeId);
    if (!node || !node.actions?.includes(actionId)) {
      return { ok: false, reason: 'Action unavailable here.' };
    }
    const history = this.state.actionHistory?.[nodeId]?.[actionId] ?? 0;
    if (history > 0) {
      return { ok: false, reason: 'Already completed.' };
    }
    const preview = computeActionPreview(node, actionId);
    const costs = Array.isArray(preview?.costs) ? preview.costs : [];
    const insufficient = costs.find((cost) => {
      const amount = typeof cost.amount === 'number' ? cost.amount : cost.min ?? 0;
      const resourceValue = this.state.resources?.[cost.resource];
      return typeof resourceValue === 'number' && resourceValue < amount;
    });
    if (insufficient) {
      return { ok: false, reason: `Need ${insufficient.resource} ${insufficient.amount ?? insufficient.min}.` };
    }
    const result = rollActionOutcome({ actionId, node, seed: this.state.seed, usage: history });
    if (!result) {
      return { ok: false, reason: 'Action not ready yet.' };
    }
    const timeCost = Math.max(1, Math.round(result.timeCost || 1));
    this._advanceTime('action', timeCost);
    this._applyResourceDeltas(result.deltas || {});

    if (!this.state.actionHistory[nodeId]) {
      this.state.actionHistory[nodeId] = {};
    }
    this.state.actionHistory[nodeId][actionId] = history + 1;

    const message = result.message || `${result.title} complete.`;
    this.appendLog(`${result.title} at ${node.name}: ${message}`);
    this._persist();

    return {
      ok: true,
      message,
      deltas: result.deltas || {},
      timeCost
    };
  }

  travelTo(nodeId, _context = {}) {
    if (!this.state || this.state.flags.gameOver) {
      return null;
    }
    const previous = this.state.location;
    if (previous === nodeId) {
      return null;
    }
    const estimate = this.getTravelEstimate(previous, nodeId);
    if (!estimate) {
      return null;
    }

    this._advanceTime('travel');

    const gasCost = estimate.gasCost;
    const snackCost = estimate.snackCost;

    this.state.resources.gas = Math.max(0, this.state.resources.gas - gasCost);
    this.state.resources.snacks = Math.max(0, this.state.resources.snacks - snackCost);

    let rideDamage = 0;
    const hazard = estimate.hazard;
    if (hazard > 0.15) {
      const hazardRoll = this.rng.nextFloat();
      if (hazardRoll < hazard) {
        if (hazard > 0.75) {
          rideDamage = this.rng.nextFloat() < 0.5 ? 3 : 2;
        } else if (hazard > 0.5) {
          rideDamage = this.rng.nextFloat() < 0.6 ? 2 : 1;
        } else {
          rideDamage = 1;
        }
      }
    }
    this.state.resources.ride = Math.max(0, this.state.resources.ride - rideDamage);

    const hungryParty = this.state.resources.snacks <= 0;
    if (hungryParty) {
      this.state.party.forEach((member) => {
        member.status = 'Peckish';
      });
    }

    this.state.location = nodeId;
    if (!this.state.visited.includes(nodeId)) {
      this.state.visited.push(nodeId);
    }
    this._markKnowledge(nodeId);

    maybeTriggerTravelEncounter(this, {
      fromNodeId: previous,
      toNodeId: nodeId,
      distance: estimate.distance,
      roughness: estimate.roughness
    });

    const fromName = estimate.from?.name || previous;
    const toName = estimate.to?.name || nodeId;
    const summary = `Drove from ${fromName} to ${toName}. -${gasCost} gas, -${snackCost} snacks${rideDamage ? `, ride -${rideDamage}` : ''}.`;
    this.appendLog(summary);
    this._syncRng();

    const depleted = this.resourcesDepleted();
    if (depleted.length > 0) {
      this.appendLog(`Warning: ${depleted.join(', ')} running dry!`);
    }

    return {
      gasCost,
      snackCost,
      rideDamage,
      hungry: hungryParty,
      depleted,
      estimate
    };
  }

  resourcesDepleted() {
    if (!this.state) {
      return [];
    }
    return Object.entries(this.state.resources)
      .filter(([, value]) => value <= 0)
      .map(([key]) => key);
  }

  applyEffects(effects = {}) {
    if (!this.state) {
      return;
    }
    const { resources = {}, log, flags = {} } = effects;
    Object.entries(resources).forEach(([key, value]) => {
      if (typeof this.state.resources[key] === 'number') {
        const max = this.state.maxResources?.[key];
        const capped = typeof max === 'number' ? Math.min(max, this.state.resources[key] + value) : this.state.resources[key] + value;
        this.state.resources[key] = Math.max(0, capped);
      }
    });
    Object.entries(flags).forEach(([flag, value]) => {
      this.state.flags[flag] = value;
    });
    if (log) {
      this.appendLog(log);
    } else {
      this._persist();
    }
  }

  markGameOver(reason) {
    if (!this.state) {
      return;
    }
    this.state.flags.gameOver = true;
    this.appendLog(reason || 'Journey complete. Time to park the ride.');
    this._persist();
  }

  clearSave() {
    this.storage.removeItem(this.storageKey);
    this.state = null;
    this.rng = null;
    this.worldGraph = null;
  }

  _markKnowledge(nodeId) {
    if (!this.state.knowledge) {
      this.state.knowledge = {};
    }
    if (!this.state.knowledge[nodeId]) {
      this.state.knowledge[nodeId] = { seen: true };
    } else {
      this.state.knowledge[nodeId].seen = true;
    }
  }

  _applyResourceDeltas(deltas) {
    if (!this.state || !deltas) {
      return;
    }
    Object.entries(deltas).forEach(([resource, value]) => {
      if (typeof this.state.resources[resource] !== 'number') {
        return;
      }
      const max = this.state.maxResources?.[resource];
      const current = this.state.resources[resource];
      const next = current + value;
      if (typeof max === 'number') {
        this.state.resources[resource] = Math.max(0, Math.min(max, next));
      } else {
        this.state.resources[resource] = Math.max(0, next);
      }
    });
  }

  _advanceTime(mode, segments = 1) {
    if (!this.state) {
      return;
    }
    if (mode === 'travel') {
      this.state.day += 1;
      this.state.timeSegment = 0;
      return;
    }
    if (mode === 'action') {
      const steps = Math.max(1, segments | 0);
      for (let index = 0; index < steps; index += 1) {
        this.state.timeSegment = (this.state.timeSegment + 1) % TIME_SEGMENTS.length;
        if (this.state.timeSegment === 0) {
          this.state.day += 1;
        }
      }
    }
  }

  async _ensureWorldGraph({ regenerate = false } = {}) {
    if (!this.state) {
      return null;
    }
    const worldInfo = this.state.world || { version: 1, type: 'legacy', seed: this.state.seed };
    if (!regenerate && this.worldGraph) {
      return this.worldGraph;
    }

    if (worldInfo.type === 'legacy' || worldInfo.version === 1) {
      const graph = await loadLegacyGraph();
      this.worldGraph = graph;
      if (!this.state.location || !graph.nodes.has(this.state.location)) {
        this.state.location = graph.start;
      }
      if (!Array.isArray(this.state.visited) || this.state.visited.length === 0) {
        this.state.visited = [this.state.location];
      } else if (!this.state.visited.includes(this.state.location)) {
        this.state.visited.unshift(this.state.location);
      }
      this._markKnowledge(this.state.location);
      this.state.world = { version: 1, type: 'legacy', seed: this.state.seed };
      return this.worldGraph;
    }

    const baseSeed = worldInfo.seed ?? this.state.seed;
    const world = await generateWorldGraph({ baseSeed });
    this.worldGraph = world;
    this.state.world.version = world.version;
    this.state.world.seed = baseSeed;
    this.state.world.type = 'generated';
    if (!this.state.location || !world.nodes.has(this.state.location)) {
      this.state.location = world.start;
    }
    if (!Array.isArray(this.state.visited) || this.state.visited.length === 0) {
      this.state.visited = [this.state.location];
    } else if (!this.state.visited.includes(this.state.location)) {
      this.state.visited.unshift(this.state.location);
    }
    this._markKnowledge(this.state.location);
    return this.worldGraph;
  }

  _migrateState() {
    if (!this.state) {
      return;
    }
    if (typeof this.state.version !== 'number' || this.state.version < CURRENT_STATE_VERSION) {
      this.state.version = CURRENT_STATE_VERSION;
    }
    if (typeof this.state.timeSegment !== 'number') {
      this.state.timeSegment = 0;
    }
    if (!Array.isArray(this.state.visited)) {
      this.state.visited = [];
    }
    if (!this.state.knowledge) {
      this.state.knowledge = {};
    }
    if (!this.state.actionHistory) {
      this.state.actionHistory = {};
    }
    if (!this.state.world) {
      this.state.world = { version: 1, type: 'legacy', seed: this.state.seed };
    } else if (!this.state.world.type) {
      this.state.world.type = this.state.world.version && this.state.world.version >= 2 ? 'generated' : 'legacy';
    }
    if (!this.state.location && this.state.visited.length > 0) {
      [this.state.location] = this.state.visited;
    }
    if (this.state.location) {
      this._markKnowledge(this.state.location);
    }
  }

  _syncRng() {
    if (this.state && this.rng) {
      this.state.rngState = this.rng.serialize().state;
    }
  }

  _persist() {
    if (!this.state) {
      return;
    }
    this._syncRng();
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  _load() {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error('Failed to parse save game', error);
      return null;
    }
  }
}
