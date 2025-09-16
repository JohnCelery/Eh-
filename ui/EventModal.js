import { trapFocus, releaseFocus } from '../systems/a11y.js';

export default class EventModal {
  constructor(container = document.body) {
    this.container = container;
    this.backdrop = null;
    this.modal = null;
    this.currentEvent = null;
    this.choiceHandler = null;
    this.closeHandler = null;
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
    body.textContent = eventData.stages?.[0]?.text || eventData.text || '';
    this.modal.append(body);

    const choiceGrid = document.createElement('div');
    choiceGrid.className = 'choice-grid';
    const stage = eventData.stages?.[0];
    const choices = stage?.choices || [];
    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.dataset.choiceId = choice.id;
      button.addEventListener('click', () => {
        if (typeof this.choiceHandler === 'function') {
          this.choiceHandler(choice);
        }
      });
      choiceGrid.append(button);
    });

    if (!choices.length) {
      const noop = document.createElement('p');
      noop.textContent = 'There are no choices defined for this encounter yet.';
      choiceGrid.append(noop);
    }

    this.modal.append(choiceGrid);

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
  }

  showOutcome(text) {
    if (!this.modal) {
      return;
    }
    const outcome = this.modal.querySelector('.modal-outcome');
    if (outcome) {
      outcome.textContent = text;
    }
    const buttons = this.modal.querySelectorAll('.choice-grid button');
    buttons.forEach((button) => {
      button.disabled = true;
    });
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
    const callback = this.closeHandler;
    this.closeHandler = null;
    if (typeof callback === 'function') {
      callback();
    }
  }
}
