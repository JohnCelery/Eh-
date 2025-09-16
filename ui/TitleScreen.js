import { assets } from '../systems/assets.js';

export default class TitleScreen {
  constructor({ screenManager, gameState }) {
    this.screenManager = screenManager;
    this.gameState = gameState;
    this.continueAvailable = false;
    this.continueButton = null;
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
    const hero = assets.get('ui.hero');

    const section = document.createElement('section');
    section.className = 'screen title-screen';
    section.setAttribute('aria-labelledby', 'title-screen-heading');

    section.innerHTML = `
      <div class="screen-header">
        <h2 id="title-screen-heading">Pack up, family! We're heading Out There, Eh?</h2>
        <p>Settle into a cozy Canadian road-trip roguelike. Every journey begins with a full thermos, a hopeful playlist, and a single seed for fate.</p>
      </div>
    `;

    const media = document.createElement('div');
    if (hero?.src) {
      const img = document.createElement('img');
      img.src = hero.src;
      img.alt = hero.alt || 'Illustration of a van cresting a snowy hill';
      img.className = 'placeholder-image';
      media.append(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder-image';
      placeholder.textContent = 'Canadian Trail';
      media.append(placeholder);
    }
    section.append(media);

    const actions = document.createElement('div');
    actions.className = 'inline-chips';
    ['Deterministic runs', 'Single seed RNG', 'Family banter'].forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      actions.append(span);
    });
    section.append(actions);

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

    section.append(buttons);

    const footer = document.createElement('p');
    footer.className = 'screen-footer';
    footer.textContent = 'Tip: Your seed remembers everything. Share it to challenge friends across the provinces!';
    section.append(footer);

    return section;
  }
}
