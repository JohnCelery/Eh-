import { trapFocus, releaseFocus } from '../systems/a11y.js';

export default class EventModal {
  constructor(container = document.body) {
    this.container = container;
    this.backdrop = null;
    this.modal = null;
    this.currentEvent = null;
    this.choiceHandler = null;
    this.closeHandler = null;
    this.stage = null;
    this.bodyElement = null;
    this.choiceGrid = null;
    this.outcomeElement = null;
  }

  open(eventData, { onChoice, onClose } = {}) {
    this.close();
    this.currentEvent = eventData;
    this.choiceHandler = onChoice;
    this.closeHandler = onClose;

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-backdrop';

    this.modal = document.createElement('div');
    this.modal.className = 'modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.tabIndex = -1;

    const title = document.createElement('h2');
    title.id = `event-${eventData.id}-title`;
    title.textContent = eventData.title || 'Unexpected encounter';
    this.modal.setAttribute('aria-labelledby', title.id);
    this.modal.append(title);

    const body = document.createElement('p');
    body.className = 'modal-body';
    body.textContent = '';
    this.modal.append(body);
    this.bodyElement = body;

    const choiceGrid = document.createElement('div');
    choiceGrid.className = 'choice-grid';
    this.modal.append(choiceGrid);
    this.choiceGrid = choiceGrid;

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'secondary';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => this.close());
    footer.append(closeButton);

    const outcome = document.createElement('p');
    outcome.className = 'modal-outcome';
    outcome.setAttribute('aria-live', 'polite');
    footer.append(outcome);
    this.outcomeElement = outcome;

    this.modal.append(footer);

    this.backdrop.append(this.modal);
    this.container.append(this.backdrop);

    this._handleEscape = (event) => {
      if (event.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this._handleEscape);

    trapFocus(this.modal);

    const initialStage = eventData.stage || eventData.stages?.[0] || null;
    this.setStage(initialStage);
  }

  showOutcome(text, { lock = true } = {}) {
    if (!this.modal) {
      return;
    }
    if (this.outcomeElement) {
      this.outcomeElement.textContent = text || '';
    }
    if (lock && this.choiceGrid) {
      const buttons = this.choiceGrid.querySelectorAll('button');
      buttons.forEach((button) => {
        button.disabled = true;
      });
    }
  }

  setStage(stage) {
    this.stage = stage || null;
    if (!this.modal) {
      return;
    }
    if (this.outcomeElement) {
      this.outcomeElement.textContent = '';
    }
    if (this.bodyElement) {
      const text = this.stage?.text || this.currentEvent?.text || '';
      this.bodyElement.textContent = text;
    }
    if (!this.choiceGrid) {
      return;
    }
    this.choiceGrid.innerHTML = '';
    const choices = this.stage?.choices || [];
    if (!choices.length) {
      const message = document.createElement('p');
      message.textContent = 'No decisions remain here.';
      this.choiceGrid.append(message);
      return;
    }
    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.dataset.choiceId = choice.id;
      button.addEventListener('click', () => {
        if (typeof this.choiceHandler === 'function') {
          this.choiceHandler(this.stage, choice);
        }
      });
      this.choiceGrid.append(button);
    });
    const firstButton = this.choiceGrid.querySelector('button');
    if (firstButton && typeof firstButton.focus === 'function') {
      firstButton.focus({ preventScroll: true });
    }
  }

  close() {
    if (!this.backdrop) {
      return;
    }
    if (this.modal) {
      releaseFocus(this.modal);
    }
    document.removeEventListener('keydown', this._handleEscape);
    this.backdrop.remove();
    this.backdrop = null;
    this.modal = null;
    this.bodyElement = null;
    this.choiceGrid = null;
    this.outcomeElement = null;
    this.stage = null;
    const callback = this.closeHandler;
    this.closeHandler = null;
    if (typeof callback === 'function') {
      callback();
    }
  }
}
