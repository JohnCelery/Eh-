import { createDerivedRNG } from './rng.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRange(range, defaults = { min: 0, max: 0 }) {
  const resolvedMin = Number.isFinite(range?.min) ? range.min : defaults.min ?? 0;
  const resolvedMax = Number.isFinite(range?.max) ? range.max : defaults.max ?? resolvedMin;
  const min = Math.max(0, Math.round(resolvedMin));
  const max = Math.max(min, Math.round(resolvedMax));
  return { min, max };
}

function pickInt(rng, range) {
  return rng.nextInt(range.min, range.max);
}

function computeFerryCost(profile) {
  const base = profile?.services?.ferryCost ?? 4;
  return Math.max(1, Math.round(base));
}

function computeShopCost(profile) {
  const serviceCost = profile?.services?.shopCost;
  if (Number.isFinite(serviceCost)) {
    return Math.max(1, Math.round(serviceCost));
  }
  const prosperity = clamp(profile?.prosperity ?? 0.5, 0, 1);
  return Math.max(2, Math.round(3 + prosperity * 3));
}

const ACTION_DEFINITIONS = {
  siphon: {
    id: 'siphon',
    title: 'Siphon',
    description: 'Trade time for gas at risk of fumes.',
    preview(node) {
      const gasRange = normalizeRange(node?.profile?.yields?.gas, { min: 1, max: 3 });
      const hazard = clamp(node?.profile?.hazard ?? 0.2, 0, 1);
      const rideMax = hazard > 0.7 ? 2 : hazard > 0.45 ? 1 : 0;
      return {
        id: 'siphon',
        title: this.title,
        description: this.description,
        yields: [{ resource: 'gas', min: gasRange.min, max: gasRange.max }],
        costs: [],
        mishaps: rideMax ? [{ resource: 'ride', min: 0, max: rideMax }] : [],
        timeCost: 1
      };
    },
    roll(node, rng) {
      const gasRange = normalizeRange(node?.profile?.yields?.gas, { min: 1, max: 3 });
      const gasGain = pickInt(rng, gasRange);
      const hazard = clamp(node?.profile?.hazard ?? 0.2, 0, 1);
      const mishapChance = Math.min(0.85, hazard + 0.15);
      let rideDamage = 0;
      if (mishapChance > 0 && rng.nextFloat() < mishapChance) {
        rideDamage = hazard > 0.75 ? 2 : 1;
        if (hazard > 0.9 && rng.nextFloat() < 0.35) {
          rideDamage += 1;
        }
      }
      const parts = [`Siphoned ${gasGain} gas`];
      if (rideDamage > 0) {
        parts.push(`ride -${rideDamage}`);
      }
      return {
        deltas: { gas: gasGain, snacks: 0, ride: -rideDamage, money: 0 },
        timeCost: 1,
        message: `${parts.join(', ')}.`
      };
    }
  },
  forage: {
    id: 'forage',
    title: 'Forage',
    description: 'Scout nearby forests for berries and jerky.',
    preview(node) {
      const snackRange = normalizeRange(node?.profile?.yields?.snacks, { min: 1, max: 4 });
      const hazard = clamp(node?.profile?.hazard ?? 0.15, 0, 1);
      const rideMax = hazard > 0.55 ? 1 : 0;
      return {
        id: 'forage',
        title: this.title,
        description: this.description,
        yields: [{ resource: 'snacks', min: snackRange.min, max: snackRange.max }],
        costs: [],
        mishaps: rideMax ? [{ resource: 'ride', min: 0, max: rideMax }] : [],
        timeCost: 1
      };
    },
    roll(node, rng) {
      const snackRange = normalizeRange(node?.profile?.yields?.snacks, { min: 1, max: 4 });
      const snackGain = pickInt(rng, snackRange);
      const hazard = clamp(node?.profile?.hazard ?? 0.15, 0, 1);
      let rideDamage = 0;
      if (hazard > 0.4 && rng.nextFloat() < hazard / 2) {
        rideDamage = 1;
      }
      let bonusGas = 0;
      const abundance = clamp(node?.profile?.abundance ?? 0.4, 0, 1);
      if (rng.nextFloat() < abundance * 0.3) {
        bonusGas = 1;
      }
      const parts = [`Foraged ${snackGain} snacks`];
      if (bonusGas > 0) {
        parts.push(`found ${bonusGas} gas can`);
      }
      if (rideDamage > 0) {
        parts.push('scrapes cost 1 ride');
      }
      return {
        deltas: { gas: bonusGas, snacks: snackGain, ride: -rideDamage, money: 0 },
        timeCost: 1,
        message: `${parts.join(', ')}.`
      };
    }
  },
  tinker: {
    id: 'tinker',
    title: 'Tinker',
    description: 'Repair the ride with spare parts and elbow grease.',
    preview(node) {
      const rideRange = normalizeRange(node?.profile?.yields?.ride, { min: 1, max: 3 });
      const gasCost = node?.profile?.services?.mechanic ? 1 : 2;
      return {
        id: 'tinker',
        title: this.title,
        description: this.description,
        yields: [{ resource: 'ride', min: rideRange.min, max: rideRange.max }],
        costs: gasCost ? [{ resource: 'gas', amount: gasCost }] : [],
        mishaps: [],
        timeCost: 1
      };
    },
    roll(node, rng) {
      const rideRange = normalizeRange(node?.profile?.yields?.ride, { min: 1, max: 3 });
      const rideGain = pickInt(rng, rideRange);
      const mechanicBonus = node?.profile?.services?.mechanic ? 1 : 0;
      const totalRide = Math.max(1, rideGain + mechanicBonus);
      const gasCost = node?.profile?.services?.mechanic ? 1 : 2;
      const parts = [`Ride +${totalRide}`];
      if (gasCost > 0) {
        parts.push(`spent ${gasCost} gas`);
      }
      return {
        deltas: { gas: -gasCost, snacks: 0, ride: totalRide, money: 0 },
        timeCost: 1,
        message: `${parts.join(', ')}.`
      };
    }
  },
  scavenge: {
    id: 'scavenge',
    title: 'Scavenge',
    description: 'Pick through the area for loose change and parts.',
    preview(node) {
      const moneyRange = normalizeRange(node?.profile?.yields?.money, { min: 1, max: 4 });
      const hazard = clamp(node?.profile?.hazard ?? 0.35, 0, 1);
      const rideMax = hazard > 0.6 ? 2 : hazard > 0.4 ? 1 : 0;
      return {
        id: 'scavenge',
        title: this.title,
        description: this.description,
        yields: [{ resource: 'money', min: moneyRange.min, max: moneyRange.max }],
        costs: [],
        mishaps: rideMax ? [{ resource: 'ride', min: 0, max: rideMax }] : [],
        timeCost: 1
      };
    },
    roll(node, rng) {
      const moneyRange = normalizeRange(node?.profile?.yields?.money, { min: 1, max: 4 });
      const cash = pickInt(rng, moneyRange);
      const abundance = clamp(node?.profile?.abundance ?? 0.4, 0, 1);
      let gasFind = 0;
      if (rng.nextFloat() < abundance * 0.25) {
        gasFind = 1;
      }
      const hazard = clamp(node?.profile?.hazard ?? 0.35, 0, 1);
      let rideDamage = 0;
      if (hazard > 0.3 && rng.nextFloat() < hazard * 0.6) {
        rideDamage = hazard > 0.75 && rng.nextFloat() < 0.4 ? 2 : 1;
      }
      const parts = [`Scavenged $${cash}`];
      if (gasFind > 0) {
        parts.push('plus 1 gas');
      }
      if (rideDamage > 0) {
        parts.push(`ride -${rideDamage}`);
      }
      return {
        deltas: { gas: gasFind, snacks: 0, ride: -rideDamage, money: cash },
        timeCost: 1,
        message: `${parts.join(', ')}.`
      };
    }
  },
  ferry: {
    id: 'ferry',
    title: 'Ferry',
    description: 'Pay a toll to cross water safely.',
    preview(node) {
      const rideRange = normalizeRange(node?.profile?.yields?.ride, { min: 1, max: 3 });
      const snacksRange = normalizeRange(node?.profile?.yields?.snacks, { min: 0, max: 2 });
      const cost = computeFerryCost(node?.profile);
      return {
        id: 'ferry',
        title: this.title,
        description: this.description,
        yields: [
          { resource: 'ride', min: rideRange.min, max: rideRange.max },
          { resource: 'snacks', min: snacksRange.min ? 1 : 0, max: snacksRange.max }
        ],
        costs: [{ resource: 'money', amount: cost }],
        mishaps: [],
        timeCost: 1
      };
    },
    roll(node, rng) {
      const rideRange = normalizeRange(node?.profile?.yields?.ride, { min: 1, max: 3 });
      const rideGain = Math.max(1, Math.round((rideRange.min + rideRange.max) / 2));
      const snacksRange = normalizeRange(node?.profile?.yields?.snacks, { min: 0, max: 2 });
      let snackGain = 0;
      if (snacksRange.max > 0 && rng.nextFloat() < 0.7) {
        snackGain = pickInt(rng, { min: Math.min(1, snacksRange.max), max: snacksRange.max });
      }
      const cost = computeFerryCost(node?.profile);
      const parts = [`Paid $${cost} for the ferry`, `ride +${rideGain}`];
      if (snackGain > 0) {
        parts.push(`restocked ${snackGain} snacks`);
      }
      return {
        deltas: { gas: 0, snacks: snackGain, ride: rideGain, money: -cost },
        timeCost: 1,
        message: `${parts.join(', ')}.`
      };
    }
  },
  shop: {
    id: 'shop',
    title: 'Shop',
    description: 'Visit shops and upgrade stands for supplies.',
    preview(node) {
      const gasRange = normalizeRange(node?.profile?.yields?.gas, { min: 1, max: 4 });
      const snackRange = normalizeRange(node?.profile?.yields?.snacks, { min: 1, max: 4 });
      const cost = computeShopCost(node?.profile);
      return {
        id: 'shop',
        title: this.title,
        description: this.description,
        yields: [
          { resource: 'gas', min: gasRange.min, max: gasRange.max },
          { resource: 'snacks', min: snackRange.min, max: snackRange.max }
        ],
        costs: [{ resource: 'money', amount: cost }],
        mishaps: [],
        timeCost: 1
      };
    },
    roll(node, rng) {
      const gasRange = normalizeRange(node?.profile?.yields?.gas, { min: 1, max: 4 });
      const snackRange = normalizeRange(node?.profile?.yields?.snacks, { min: 1, max: 4 });
      const gasGain = pickInt(rng, gasRange);
      const snackGain = pickInt(rng, snackRange);
      const cost = computeShopCost(node?.profile);
      const parts = [`Bought supplies for $${cost}`, `gas +${gasGain}`, `snacks +${snackGain}`];
      return {
        deltas: { gas: gasGain, snacks: snackGain, ride: 0, money: -cost },
        timeCost: 1,
        message: `${parts.join(', ')}.`
      };
    }
  }
};

export function getActionDefinition(actionId) {
  return ACTION_DEFINITIONS[actionId] || null;
}

export function computeActionPreview(node, actionId) {
  const definition = getActionDefinition(actionId);
  if (!definition || typeof definition.preview !== 'function') {
    return null;
  }
  return definition.preview(node);
}

export function rollActionOutcome({ actionId, node, seed, usage = 0 }) {
  const definition = getActionDefinition(actionId);
  if (!definition || typeof definition.roll !== 'function') {
    return null;
  }
  const rng = createDerivedRNG(seed, node.id, actionId, usage);
  const result = definition.roll(node, rng);
  return {
    id: actionId,
    title: definition.title,
    description: definition.description,
    ...result
  };
}

export function listActions() {
  return Object.keys(ACTION_DEFINITIONS);
}
