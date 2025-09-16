import { RNG } from './rng.js';

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

export const VEHICLES = [
  {
    id: 'minivan',
    name: 'Prairie Minivan',
    description: 'Balanced and comfortable. Plenty of cup holders and a trusty VHS player.',
    stats: { gas: 8, snacks: 6, ride: 7, money: 60 },
    traits: ['Balanced consumption', 'Family-friendly']
  },
  {
    id: 'pickup',
    name: 'Northern Pickup',
    description: 'Rugged and ready for rough gravel. A little thirsty on fuel.',
    stats: { gas: 7, snacks: 5, ride: 9, money: 40 },
    traits: ['Heavy-duty suspension', 'Extra gear rack']
  },
  {
    id: 'schoolbus',
    name: 'Retro School Bus',
    description: 'Converted bus with bunks. Slow, but everyone gets elbow room.',
    stats: { gas: 6, snacks: 9, ride: 8, money: 80 },
    traits: ['Huge snack pantry', 'Neighborhood legend']
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

export class GameState {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'canadian-trail-save';
    this.storage = options.storage || defaultStorage;
    this.state = null;
    this.rng = null;
  }

  async initialize() {
    const saved = this._load();
    if (saved) {
      this.state = saved;
      const rngState = saved.rngState ?? saved.seed;
      this.rng = new RNG(saved.seed, rngState);
      this._syncRng();
    }
  }

  hasActiveSave() {
    return Boolean(this.state);
  }

  startNewRun({ seed, vehicleId } = {}) {
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
      version: 1,
      seed: resolvedSeed,
      rngState: this.rng.serialize().state,
      day: 1,
      vehicle: {
        id: vehicle.id,
        name: vehicle.name,
        traits: vehicle.traits,
        description: vehicle.description
      },
      resources,
      maxResources,
      party: roster,
      log: ['Packed the cooler, topped up the tank, ready to roll from Halifax!'],
      location: 'halifax-hub',
      visited: ['halifax-hub'],
      flags: {
        gameOver: false
      }
    };

    this._persist();
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
    this.state.log.push(`[Day ${this.state.day}] ${entry}`);
    if (this.state.log.length > LOG_LIMIT) {
      this.state.log.splice(0, this.state.log.length - LOG_LIMIT);
    }
    this._persist();
  }

  travelTo(nodeId, context = {}) {
    if (!this.state || this.state.flags.gameOver) {
      return null;
    }

    const previous = this.state.location;
    this.state.day += 1;

    const gasCost = Math.max(1, Math.round(context.distance || 1));
    const snackCost = 1;

    this.state.resources.gas = Math.max(0, this.state.resources.gas - gasCost);
    this.state.resources.snacks = Math.max(0, this.state.resources.snacks - snackCost);

    let rideDamage = 0;
    if (context.roughRoad) {
      rideDamage = this.rng.nextFloat() < 0.6 ? 2 : 1;
    } else {
      rideDamage = this.rng.nextFloat() < 0.25 ? 1 : 0;
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

    const summary = `Drove from ${context.fromName || previous} to ${context.toName || nodeId}. -${gasCost} gas, -${snackCost} snacks${rideDamage ? `, ride -${rideDamage}` : ''}.`;
    this.appendLog(summary);
    this._syncRng();
    this._persist();

    const depleted = this.resourcesDepleted();
    if (depleted.length > 0) {
      this.appendLog(`Warning: ${depleted.join(', ')} running dry!`);
    }

    return {
      gasCost,
      snackCost,
      rideDamage,
      hungry: hungryParty,
      depleted
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
        this.state.resources[key] = Math.min(
          this.state.maxResources[key] ?? Number.POSITIVE_INFINITY,
          Math.max(0, this.state.resources[key] + value)
        );
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
