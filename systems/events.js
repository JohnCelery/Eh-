import { loadJSON } from './jsonLoader.js';

const RARITY_WEIGHTS = {
  common: 6,
  uncommon: 3,
  rare: 1
};

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export class EventEngine {
  constructor() {
    this.events = new Map();
  }

  async initialize() {
    const data = await loadJSON('../data/events.json');
    const list = ensureArray(data.events);
    list.forEach((event) => {
      if (!event || !event.id) {
        return;
      }
      const normalized = this._normalizeEvent(event);
      this.events.set(normalized.id, normalized);
    });
  }

  _normalizeEvent(event) {
    const stages = ensureArray(event.stages).map((stage, stageIndex) => {
      const stageId = stage.id || `stage-${stageIndex}`;
      const choices = ensureArray(stage.choices).map((choice, choiceIndex) => ({
        ...choice,
        id: choice.id || `${stageId}-choice-${choiceIndex}`
      }));
      return {
        ...stage,
        id: stageId,
        choices
      };
    });
    const stageMap = new Map();
    stages.forEach((stage) => {
      stageMap.set(stage.id, stage);
    });
    return {
      ...event,
      hook: event.hook || 'arrival',
      rarity: event.rarity || 'common',
      cooldown: typeof event.cooldown === 'number' ? event.cooldown : 0,
      stages,
      stageMap,
      requires: event.requires || {}
    };
  }

  maybeTrigger(hook, gameState, context = {}) {
    if (!gameState?.state) {
      return null;
    }
    const snapshot = gameState.getSnapshot();
    const eligible = [];
    this.events.forEach((event) => {
      if (event.hook !== hook) {
        return;
      }
      if (!this._passesRequirements(event, gameState, snapshot, context)) {
        return;
      }
      eligible.push(event);
    });
    if (!eligible.length) {
      return null;
    }
    const weights = eligible.map((event) => {
      if (typeof event.weight === 'number') {
        return Math.max(0, event.weight);
      }
      return RARITY_WEIGHTS[event.rarity] || 1;
    });
    const picked = this._pickWeighted(gameState, eligible, weights);
    if (!picked) {
      return null;
    }
    gameState.recordEncounterTrigger(picked.id);
    if (picked.summary) {
      gameState.appendLog(picked.summary);
    }
    const stage = this._getStage(picked, picked.entryStage || picked.stages[0]?.id);
    if (!stage) {
      return null;
    }
    return {
      id: picked.id,
      title: picked.title,
      hook: picked.hook,
      stage: this._cloneStage(stage),
      stageId: stage.id,
      context: { ...context }
    };
  }

  _getStage(event, stageId) {
    if (!event) {
      return null;
    }
    if (stageId && event.stageMap.has(stageId)) {
      return event.stageMap.get(stageId);
    }
    return event.stages[0] || null;
  }

  _cloneStage(stage) {
    return stage ? clone(stage) : null;
  }

  resolveChoice(eventId, stageId, choiceId, gameState, context = {}) {
    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`Unknown event: ${eventId}`);
    }
    const stage = this._getStage(event, stageId);
    if (!stage) {
      throw new Error(`Unknown stage ${stageId} for event ${eventId}`);
    }
    const choice = stage.choices.find((entry) => entry.id === choiceId);
    if (!choice) {
      throw new Error(`Unknown choice ${choiceId} for stage ${stageId}`);
    }

    const outcomeParts = [];
    if (choice.outcome) {
      outcomeParts.push(choice.outcome);
    }
    if (choice.log) {
      gameState.appendLog(choice.log);
    }

    ensureArray(choice.effects).forEach((effect) => {
      const message = this._applyEffect(effect, { event, stage, choice, gameState, context });
      if (message) {
        outcomeParts.push(message);
      }
    });

    let rollResult = null;
    if (choice.roll) {
      const chance = typeof choice.roll.chance === 'number' ? choice.roll.chance : 0.5;
      const roll = gameState.rng.nextFloat();
      const success = roll <= chance;
      const branch = success ? choice.roll.success : choice.roll.failure;
      if (branch) {
        if (branch.outcome) {
          outcomeParts.push(branch.outcome);
        }
        ensureArray(branch.effects).forEach((effect) => {
          const message = this._applyEffect(effect, { event, stage, choice, gameState, context });
          if (message) {
            outcomeParts.push(message);
          }
        });
      }
      rollResult = { roll, success };
    }

    this._applyChoiceFlags(choice, gameState);

    const nextStageId = choice.nextStage || null;
    const nextStage = nextStageId ? this._getStage(event, nextStageId) : null;

    return {
      outcome: outcomeParts.join(' ').trim(),
      nextStage: this._cloneStage(nextStage),
      nextStageId: nextStage?.id || null,
      done: !nextStage,
      roll: rollResult
    };
  }

  _applyChoiceFlags(choice, gameState) {
    const setters = choice.setFlags;
    if (Array.isArray(setters)) {
      setters.forEach((flag) => {
        gameState.setEncounterFlag(flag, true);
      });
    } else if (setters && typeof setters === 'object') {
      Object.entries(setters).forEach(([flag, value]) => {
        gameState.setEncounterFlag(flag, value !== undefined ? value : true);
      });
    }
    const clearers = choice.clearFlags;
    if (Array.isArray(clearers)) {
      clearers.forEach((flag) => {
        gameState.clearEncounterFlag(flag);
      });
    }
  }

  _applyEffect(effect, context) {
    if (!effect || typeof effect !== 'object') {
      return null;
    }
    const { gameState, event, stage, choice } = context;
    const encounterContext = context.context;
    switch (effect.type) {
      case 'resources': {
        const changes = effect.changes || effect.resources || {};
        gameState.adjustResources(changes);
        return effect.message || null;
      }
      case 'log': {
        if (effect.message) {
          gameState.appendLog(effect.message);
        }
        return null;
      }
      case 'dayShift':
      case 'days': {
        const delta = typeof effect.days === 'number' ? effect.days : effect.amount;
        if (typeof delta === 'number' && delta) {
          gameState.shiftDays(delta);
        }
        return effect.message || null;
      }
      case 'revealNeighbors': {
        const targetId = this._resolveTargetNodeId(effect.target, gameState, encounterContext);
        if (!targetId) {
          return null;
        }
        const options = {};
        if (effect.hazardHints) {
          options.hazardHints = true;
        }
        if (typeof effect.maxHazard === 'number') {
          options.filter = (connection) => {
            const hazard = typeof connection.hazard === 'number' ? connection.hazard : 0;
            return hazard <= effect.maxHazard;
          };
        }
        const revealed = gameState.revealNeighbors(targetId, options);
        if (effect.message) {
          return effect.message.replace('{count}', revealed.length);
        }
        return null;
      }
      case 'revealHazards': {
        const targetId = this._resolveTargetNodeId(effect.target, gameState, encounterContext);
        if (!targetId) {
          return null;
        }
        const revealed = gameState.revealNeighbors(targetId, { hazardHints: true });
        if (effect.message) {
          return effect.message.replace('{count}', revealed.length);
        }
        return null;
      }
      case 'setFlag': {
        if (effect.flag) {
          gameState.setEncounterFlag(effect.flag, effect.value !== undefined ? effect.value : true);
        }
        return effect.message || null;
      }
      case 'clearFlag': {
        if (effect.flag) {
          gameState.clearEncounterFlag(effect.flag);
        }
        return effect.message || null;
      }
      case 'addBuff': {
        const baseId = effect.id || `${event.id}-${stage.id}-${choice.id}-${effect.kind || 'buff'}`;
        gameState.addEncounterBuff({
          id: baseId,
          kind: effect.kind || 'generic',
          amount: typeof effect.amount === 'number' ? effect.amount : (typeof effect.value === 'number' ? effect.value : 0),
          remaining: typeof effect.remaining === 'number' ? effect.remaining : undefined,
          duration: effect.duration,
          tick: effect.tick || (effect.kind === 'skip-hazard' ? 'manual' : 'travel'),
          label: effect.label || null,
          meta: effect.meta || {}
        });
        return effect.message || null;
      }
      case 'clearBuff': {
        if (effect.id) {
          gameState.removeEncounterBuff(effect.id);
        }
        if (effect.kind) {
          const buffs = gameState.getEncounterBuffs();
          buffs.forEach((buff) => {
            if (buff.kind === effect.kind) {
              gameState.removeEncounterBuff(buff.id);
            }
          });
        }
        return effect.message || null;
      }
      case 'teleport': {
        const targetId = this._resolveTeleportTarget(effect, gameState, encounterContext);
        if (targetId) {
          gameState.teleportTo(targetId, { dayShift: effect.dayShift || 0, log: effect.log });
          if (effect.revealNeighbors) {
            gameState.revealNeighbors(targetId, { hazardHints: Boolean(effect.hazardHints) });
          }
          return effect.message || null;
        }
        return null;
      }
      default:
        return null;
    }
  }

  _resolveTargetNodeId(target, gameState, context) {
    const fallback = gameState.state?.location || null;
    if (!target) {
      return fallback;
    }
    if (typeof target === 'string' && target.startsWith('node:')) {
      return target.slice(5);
    }
    if (typeof target === 'string') {
      switch (target) {
        case 'current':
        case 'here':
          return gameState.state?.location || null;
        case 'origin':
        case 'from':
          return context?.fromNodeId || context?.originId || null;
        case 'destination':
        case 'arrival':
        case 'to':
          return context?.toNodeId || context?.nodeId || gameState.state?.location || null;
        default:
          return target;
      }
    }
    return fallback;
  }

  _resolveTeleportTarget(effect, gameState, context) {
    const graph = gameState.getWorldGraph();
    if (!graph) {
      return null;
    }
    if (effect.targetId) {
      return effect.targetId;
    }
    const originId = this._resolveTargetNodeId(effect.origin || effect.target || 'current', gameState, context);
    const origin = originId ? graph.nodes.get(originId) : null;
    if (!origin || !Array.isArray(origin.connections)) {
      return null;
    }
    const candidates = origin.connections
      .map((connection) => ({
        connection,
        node: graph.nodes.get(connection.id)
      }))
      .filter((entry) => Boolean(entry.node));
    if (!candidates.length) {
      return null;
    }
    if (effect.mode === 'forward') {
      const ordered = candidates
        .slice()
        .sort((a, b) => {
          const distanceA = typeof a.connection.distance === 'number' ? a.connection.distance : 1;
          const distanceB = typeof b.connection.distance === 'number' ? b.connection.distance : 1;
          return distanceB - distanceA;
        });
      const unvisited = ordered.find((entry) => !gameState.state.visited?.includes(entry.node.id));
      return (unvisited || ordered[0])?.node?.id || null;
    }
    const pool = candidates;
    if (!pool.length) {
      return null;
    }
    const index = Math.floor(gameState.rng.nextRange(0, pool.length));
    const chosen = pool[index] || pool[pool.length - 1];
    return chosen?.node?.id || null;
  }

  _passesRequirements(event, gameState, snapshot, context) {
    const day = snapshot?.day ?? 0;
    if (event.cooldown > 0) {
      const last = gameState.getEncounterCooldown(event.id);
      if (last && typeof last.day === 'number') {
        const elapsed = day - last.day;
        if (elapsed >= 0 && elapsed < event.cooldown) {
          return false;
        }
      }
    }
    const requires = event.requires || {};
    if (typeof requires.minDay === 'number' && day < requires.minDay) {
      return false;
    }
    if (typeof requires.maxDay === 'number' && day > requires.maxDay) {
      return false;
    }
    const region = this._resolveRegion(context, gameState);
    if (requires.regions && requires.regions.length) {
      if (!region || !requires.regions.includes(region)) {
        return false;
      }
    }
    if (requires.notRegions && requires.notRegions.length) {
      if (region && requires.notRegions.includes(region)) {
        return false;
      }
    }
    if (Array.isArray(requires.flags)) {
      const hasAll = requires.flags.every((flag) => gameState.hasEncounterFlag(flag));
      if (!hasAll) {
        return false;
      }
    }
    if (Array.isArray(requires.notFlags)) {
      const blocked = requires.notFlags.some((flag) => gameState.hasEncounterFlag(flag));
      if (blocked) {
        return false;
      }
    }
    if (Array.isArray(requires.contextTags) && requires.contextTags.length) {
      const tags = Array.isArray(context.tags) ? context.tags : [];
      const ok = requires.contextTags.every((tag) => tags.includes(tag));
      if (!ok) {
        return false;
      }
    }
    return true;
  }

  _resolveRegion(context, gameState) {
    if (context?.region) {
      return context.region;
    }
    if (context?.node?.region) {
      return context.node.region;
    }
    if (context?.toNode?.region) {
      return context.toNode.region;
    }
    const graph = gameState.getWorldGraph();
    if (!graph) {
      return null;
    }
    if (context?.nodeId && graph.nodes.has(context.nodeId)) {
      return graph.nodes.get(context.nodeId).region || null;
    }
    if (context?.toNodeId && graph.nodes.has(context.toNodeId)) {
      return graph.nodes.get(context.toNodeId).region || null;
    }
    const currentId = gameState.state?.location;
    if (currentId && graph.nodes.has(currentId)) {
      return graph.nodes.get(currentId).region || null;
    }
    return null;
  }

  _pickWeighted(gameState, entries, weights) {
    const total = weights.reduce((sum, weight) => sum + Math.max(0, Number(weight) || 0), 0);
    if (total <= 0) {
      return null;
    }
    let threshold = gameState.rng.nextRange(0, total);
    for (let index = 0; index < entries.length; index += 1) {
      threshold -= Math.max(0, Number(weights[index]) || 0);
      if (threshold <= 0) {
        return entries[index];
      }
    }
    return entries[entries.length - 1] || null;
  }
}
