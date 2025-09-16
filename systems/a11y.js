const focusStack = [];

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusable(container) {
  return Array.from(container.querySelectorAll(focusableSelector))
    .filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'));
}

export function trapFocus(container) {
  const previouslyFocused = document.activeElement;
  const focusable = getFocusable(container);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handleKeydown(event) {
    if (event.key !== 'Tab') {
      return;
    }
    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', handleKeydown);
  focusStack.push({ container, previouslyFocused, handleKeydown });

  window.requestAnimationFrame(() => {
    (first || container).focus({ preventScroll: true });
  });
}

export function releaseFocus(container) {
  const entryIndex = focusStack.findIndex((entry) => entry.container === container);
  if (entryIndex === -1) {
    return;
  }
  const [entry] = focusStack.splice(entryIndex, 1);
  entry.container.removeEventListener('keydown', entry.handleKeydown);
  if (entry.previouslyFocused && typeof entry.previouslyFocused.focus === 'function') {
    entry.previouslyFocused.focus({ preventScroll: true });
  }
}
