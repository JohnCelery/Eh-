import { RNG } from '../systems/rng.js';
import { GameState } from '../systems/state.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testRngDeterminism() {
  const seed = 123456789;
  const rngA = new RNG(seed);
  const rngB = new RNG(seed);
  const sequenceA = Array.from({ length: 5 }, () => rngA.nextFloat());
  const sequenceB = Array.from({ length: 5 }, () => rngB.nextFloat());
  assert(sequenceA.every((value, index) => value === sequenceB[index]), 'RNG sequences should match for identical seeds');
}

async function testSaveLoadRoundTrip() {
  const storage = (() => {
    let value = null;
    return {
      getItem() {
        return value;
      },
      setItem(key, next) {
        value = next;
      },
      removeItem() {
        value = null;
      }
    };
  })();

  const state = new GameState({ storage, storageKey: 'test-save' });
  await state.startNewRun({ seed: 999, vehicleId: 'minivan' });
  const original = state.getSnapshot();

  const loaded = new GameState({ storage, storageKey: 'test-save' });
  await loaded.initialize();
  const snapshot = loaded.getSnapshot();

  assert(snapshot.seed === original.seed, 'Loaded seed should match');
  assert(snapshot.location === original.location, 'Location should persist');
  assert(snapshot.resources.gas === original.resources.gas, 'Resources should persist');
}

async function run() {
  testRngDeterminism();
  await testSaveLoadRoundTrip();
  console.log('All tests passed');
}

run().catch((error) => {
  console.error('Tests failed');
  console.error(error);
  process.exitCode = 1;
});
