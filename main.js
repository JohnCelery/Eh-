import { GameState } from './systems/state.js';
import { loadGraph } from './systems/graph.js';
import { EventEngine } from './systems/events.js';
import TitleScreen from './ui/TitleScreen.js';
import SetupScreen from './ui/SetupScreen.js';
import MapScreen from './ui/MapScreen.js';
import EndScreen from './ui/EndScreen.js';
import EventModal from './ui/EventModal.js';

class ScreenManager {
  constructor(root) {
    this.root = root;
    this.screens = new Map();
    this.current = null;
  }

  register(name, screen) {
    this.screens.set(name, screen);
    if (typeof screen.bind === 'function') {
      screen.bind(this);
    }
  }

  async navigate(name, params = {}) {
    const screen = this.screens.get(name);
    if (!screen) {
      throw new Error(`Unknown screen: ${name}`);
    }

    if (this.current && typeof this.current.deactivate === 'function') {
      this.current.deactivate();
    }

    const element = await screen.render(params);
    this.root.innerHTML = '';
    this.root.append(element);
    this.current = screen;

    window.requestAnimationFrame(() => {
      this.root.focus({ preventScroll: true });
    });

    if (typeof screen.activate === 'function') {
      screen.activate(params);
    }
  }
}

async function bootstrap() {
  const root = document.getElementById('app');
  const screenManager = new ScreenManager(root);
  const gameState = new GameState();
  await gameState.initialize();

  const eventEngine = new EventEngine();
  await eventEngine.initialize();

  const graph = await loadGraph();
  const eventModal = new EventModal(document.body);

  const titleScreen = new TitleScreen({ screenManager, gameState });
  const setupScreen = new SetupScreen({ screenManager, gameState });
  const mapScreen = new MapScreen({
    screenManager,
    gameState,
    graph,
    eventEngine,
    eventModal
  });
  const endScreen = new EndScreen({ screenManager, gameState });

  screenManager.register('title', titleScreen);
  screenManager.register('setup', setupScreen);
  screenManager.register('map', mapScreen);
  screenManager.register('end', endScreen);

  if (gameState.hasActiveSave()) {
    titleScreen.setContinueAvailable(true);
  }

  screenManager.navigate('title');
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap Canadian Trail', error);
  const root = document.getElementById('app');
  if (root) {
    const errorBox = document.createElement('div');
    errorBox.className = 'screen';
    errorBox.innerHTML = `
      <div class="screen-header">
        <h2>Something went sideways</h2>
        <p>We hit a pothole while loading the trail. Check the console for more details.</p>
      </div>
      <pre>${error.message}</pre>
    `;
    root.innerHTML = '';
    root.append(errorBox);
  }
});
