export default class TravelBanner {
  constructor(container) {
    this.container = container;
    this.root = null;
    this.titleElement = null;
    this.textElement = null;
    this.choiceList = null;
    this.outcomeElement = null;
    this.continueButton = null;
    this.encounter = null;
    this.stage = null;
    this.onChoice = null;
    this.onComplete = null;
  }

  open(encounter, handlers = {}) {
    this.close();
    this.encounter = encounter;
    this.onChoice = handlers.onChoice || null;
    this.onComplete = handlers.onComplete || null;

    this.root = document.createElement('section');
    this.root.className = 'travel-banner';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-live', 'polite');
    this.root.tabIndex = -1;

    const heading = document.createElement('h3');
    heading.className = 'travel-banner-title';
    heading.textContent = encounter.title || 'Roadside encounter';

    const text = document.createElement('p');
    text.className = 'travel-banner-text';

    const choiceList = document.createElement('div');
    choiceList.className = 'travel-banner-choices';

    const outcome = document.createElement('p');
    outcome.className = 'travel-banner-outcome';
    outcome.setAttribute('aria-live', 'polite');

    const controls = document.createElement('div');
    controls.className = 'travel-banner-controls';

    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'travel-banner-continue';
    continueButton.textContent = 'Continue';
    continueButton.hidden = true;
    continueButton.addEventListener('click', () => {
      if (typeof this.onComplete === 'function') {
        this.onComplete();
      }
    });
    controls.append(continueButton);

    this.root.append(heading, text, choiceList, outcome, controls);

    if (this.container) {
      this.container.innerHTML = '';
      this.container.append(this.root);
    }

    this.titleElement = heading;
    this.textElement = text;
    this.choiceList = choiceList;
    this.outcomeElement = outcome;
    this.continueButton = continueButton;

    this.setStage(encounter.stage);
    this.root.focus({ preventScroll: true });
  }

  setStage(stage) {
    this.stage = stage || null;
    if (this.encounter) {
      this.encounter.stage = this.stage;
    }
    if (this.outcomeElement) {
      this.outcomeElement.textContent = '';
    }
    if (this.continueButton) {
      this.continueButton.hidden = true;
      this.continueButton.disabled = false;
    }
    if (this.textElement) {
      const text = this.stage?.text || this.encounter?.text || '';
      this.textElement.textContent = text;
    }
    if (!this.choiceList) {
      return;
    }
    this.choiceList.innerHTML = '';
    const choices = this.stage?.choices || [];
    if (!choices.length) {
      const message = document.createElement('p');
      message.className = 'travel-banner-note';
      message.textContent = 'Nothing more to decide here.';
      this.choiceList.append(message);
      if (this.continueButton) {
        this.continueButton.hidden = false;
        this.continueButton.focus({ preventScroll: true });
      }
      return;
    }
    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'travel-banner-choice';
      button.textContent = choice.label;
      button.dataset.choiceId = choice.id;
      button.addEventListener('click', () => {
        if (typeof this.onChoice === 'function') {
          this.onChoice(stage, choice);
        }
      });
      this.choiceList.append(button);
    });
    const firstButton = this.choiceList.querySelector('button');
    if (firstButton && typeof firstButton.focus === 'function') {
      firstButton.focus({ preventScroll: true });
    }
  }

  showOutcome(text, { final = false } = {}) {
    if (this.outcomeElement) {
      this.outcomeElement.textContent = text || '';
    }
    if (this.choiceList && final) {
      const buttons = this.choiceList.querySelectorAll('button');
      buttons.forEach((button) => {
        button.disabled = true;
      });
    }
    if (this.continueButton) {
      if (final) {
        this.continueButton.hidden = false;
        this.continueButton.disabled = false;
        this.continueButton.focus({ preventScroll: true });
      } else {
        this.continueButton.hidden = true;
      }
    }
  }

  close() {
    if (this.root) {
      this.root.remove();
    }
    this.root = null;
    this.titleElement = null;
    this.textElement = null;
    this.choiceList = null;
    this.outcomeElement = null;
    this.continueButton = null;
    this.encounter = null;
    this.stage = null;
    this.onChoice = null;
    this.onComplete = null;
  }
}
