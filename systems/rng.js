const UINT32_MAX = 0xffffffff;

export class RNG {
  constructor(seed = Date.now(), state) {
    const initial = Number.isInteger(seed) ? seed >>> 0 : Math.floor(seed) >>> 0;
    this._seed = initial === 0 ? 0x1a2b3c4d : initial;
    this._state = typeof state === 'number' ? state >>> 0 || 0x1a2b3c4d : this._seed;
  }

  nextUint() {
    // xorshift32
    let x = this._state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this._state = x >>> 0;
    return this._state;
  }

  nextFloat() {
    return this.nextUint() / (UINT32_MAX + 1);
  }

  nextRange(min, max) {
    if (max <= min) {
      return min;
    }
    const span = max - min;
    return min + this.nextFloat() * span;
  }

  nextInt(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error('nextInt requires integer bounds');
    }
    if (max < min) {
      [min, max] = [max, min];
    }
    const span = max - min + 1;
    return min + Math.floor(this.nextFloat() * span);
  }

  pick(list) {
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error('Cannot pick from an empty list');
    }
    const index = this.nextInt(0, list.length - 1);
    return list[index];
  }

  serialize() {
    return {
      seed: this._seed,
      state: this._state
    };
  }

  clone() {
    return new RNG(this._seed, this._state);
  }
}

export function createRNG(seed) {
  return new RNG(seed);
}
