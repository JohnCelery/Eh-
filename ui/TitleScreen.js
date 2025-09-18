import { assets } from '../systems/assets.js';

const HERO_ALT_TEXT = 'Family van at dusk under northern lights';

export default class TitleScreen {
  constructor({ screenManager, gameState }) {
    this.screenManager = screenManager;
    this.gameState = gameState;
    this.continueAvailable = false;
    this.continueButton = null;
  }

  activate() {
    document.body.classList.add('title-mode');
  }

  deactivate() {
    document.body.classList.remove('title-mode');
  }

  bind() {}

  setContinueAvailable(value) {
    this.continueAvailable = value;
    if (this.continueButton) {
      this.continueButton.disabled = !value;
      this.continueButton.setAttribute('aria-disabled', String(!value));
    }
  }

  async render() {
    await assets.load();

    const isPortrait = window.innerHeight >= window.innerWidth;
    const heroKey = isPortrait ? 'ui.hero.portrait' : 'ui.hero.landscape';
    const hero = assets.get(heroKey);

    const section = document.createElement('section');
    section.className = 'screen title-screen';
    section.setAttribute('aria-labelledby', 'title-screen-heading');

    const heroWrapper = document.createElement('div');
    heroWrapper.className = 'title-hero';

    if (hero?.src) {
      const img = document.createElement('img');
      img.src = hero.src;
      img.alt = HERO_ALT_TEXT;
      img.loading = 'eager';
      heroWrapper.append(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'title-hero-placeholder';
      placeholder.setAttribute('role', 'img');
      placeholder.setAttribute('aria-label', HERO_ALT_TEXT);
      heroWrapper.append(placeholder);
    }

    const cta = document.createElement('div');
    cta.className = 'title-cta';

    const header = document.createElement('div');
    header.className = 'screen-header';
    header.innerHTML = `
      <h2 id="title-screen-heading">Pack up, family! We're heading Out There, Eh?</h2>
      <p>Settle into a cozy Canadian road-trip roguelike. Every journey begins with a full thermos, a hopeful playlist, and a single seed for fate.</p>
    `;
    cta.append(header);

    const actions = document.createElement('div');
    actions.className = 'inline-chips';
    ['Deterministic runs', 'Single seed RNG', 'Family banter'].forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      actions.append(span);
    });
    cta.append(actions);

    const buttons = document.createElement('div');
    buttons.className = 'action-buttons';

    const newRunButton = document.createElement('button');
    newRunButton.type = 'button';
    newRunButton.textContent = 'Start a new run';
    newRunButton.addEventListener('click', () => {
      this.screenManager.navigate('setup');
    });
    buttons.append(newRunButton);

    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'secondary';
    continueButton.textContent = 'Continue adventure';
    continueButton.disabled = !this.continueAvailable;
    continueButton.setAttribute('aria-disabled', String(!this.continueAvailable));
    continueButton.addEventListener('click', () => {
      if (!this.continueAvailable) return;
      this.screenManager.navigate('map');
    });
    buttons.append(continueButton);

    this.continueButton = continueButton;

    cta.append(buttons);

    const footer = document.createElement('p');
    footer.className = 'screen-footer';
    footer.textContent = 'Tip: Your seed remembers everything. Share it to challenge friends across the provinces!';
    cta.append(footer);

    section.append(heroWrapper, cta);

    return section;
  }
}
