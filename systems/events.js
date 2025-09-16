import { loadJSON } from './jsonLoader.js';

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function evaluateConditions(event, snapshot) {
  if (!event.when || !snapshot) {
    return true;
  }
  const { requires = {} } = event;
  if (requires.minDay && snapshot.day < requires.minDay) {
    return false;
  }
  if (requires.maxDay && snapshot.day > requires.maxDay) {
    return false;
  }
  if (Array.isArray(requires.visited) && requires.visited.length) {
    const visitedAll = requires.visited.every((nodeId) => snapshot.visited?.includes(nodeId));
    if (!visitedAll) {
      return false;
    }
  }
  return true;
}

function mergeEffects(base = {}, extra = {}) {
  const result = clone(base);
  if (extra.resources) {
    result.resources = { ...(result.resources || {}) };
    Object.entries(extra.resources).forEach(([key, value]) => {
      result.resources[key] = (result.resources[key] || 0) + value;
    });
  }
  if (extra.flags) {
    result.flags = { ...(result.flags || {}) };
    Object.entries(extra.flags).forEach(([key, value]) => {
      result.flags[key] = value;
    });
  }
  if (extra.log) {
    result.log = [result.log, extra.log].filter(Boolean).join(' ');
  }
  return result;
}

export class EventEngine {
  constructor() {
    this.events = [];
  }

  async initialize() {
    const data = await loadJSON('../data/events.json');
    this.events = Array.isArray(data.events) ? data.events : [];
  }

  findEvent(eventId) {
    return this.events.find((event) => event.id === eventId);
  }

  maybeTrigger(trigger, gameState) {
    if (!gameState?.state) {
      return null;
    }
    const snapshot = gameState.getSnapshot();
    const candidates = this.events.filter((event) => {
      if (!Array.isArray(event.when) || !event.when.includes(trigger)) {
        return false;
      }
      return evaluateConditions(event, snapshot);
    });
    if (!candidates.length) {
      return null;
    }
    const weights = candidates.map((event) => Number(event.weight) || 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let threshold = gameState.rng.nextRange(0, totalWeight);
    for (let index = 0; index < candidates.length; index += 1) {
      threshold -= weights[index];
      if (threshold <= 0) {
        return clone(candidates[index]);
      }
    }
    return clone(candidates[candidates.length - 1]);
  }

  resolveChoice(eventId, choiceId, gameState) {
    const event = this.findEvent(eventId);
    if (!event) {
      throw new Error(`Unknown event: ${eventId}`);
    }
    const stage = event.stages?.[0];
    if (!stage) {
      throw new Error(`Event ${eventId} is missing stages`);
    }
    const choice = stage.choices?.find((entry) => entry.id === choiceId);
    if (!choice) {
      throw new Error(`Unknown choice ${choiceId} for event ${eventId}`);
    }

    let effects = mergeEffects({}, choice.effects || {});
    let resultText = choice.outcome || '';
    let success = null;
    let rollValue = null;

    if (choice.roll) {
      const chance = typeof choice.roll.chance === 'number' ? choice.roll.chance : 0.5;
      rollValue = gameState.rng.nextFloat();
      success = rollValue <= chance;
      const branch = success ? choice.roll.success : choice.roll.failure;
      if (branch) {
        effects = mergeEffects(effects, branch.effects || {});
        resultText = [resultText, branch.outcome].filter(Boolean).join(' ');
      }
    }

    if (effects.log && !resultText) {
      resultText = effects.log;
    }

    gameState.applyEffects(effects);

    return {
      success,
      roll: rollValue,
      outcome: resultText,
      applied: effects
    };
  }
}
