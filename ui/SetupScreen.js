import { assets } from '../systems/assets.js';
import { VEHICLES, DEFAULT_PARTY } from '../systems/state.js';

const FAMILY_NAMES = DEFAULT_PARTY.map((member) => member.name);

function generateSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0];
  }
  return Math.floor(Date.now() % 1_000_000_000);
}

export default class SetupScreen {
  constructor({ screenManager, gameState }) {
    this.screenManager = screenManager;
    this.gameState = gameState;
  }

  bind() {}

  async render() {
    await assets.load();
    const section = document.createElement('section');
    section.className = 'screen setup-screen';
    section.setAttribute('aria-labelledby', 'setup-screen-heading');

    const header = document.createElement('div');
    header.className = 'screen-header';
    header.innerHTML = `
      <h2 id="setup-screen-heading">Dial in your rig and seed</h2>
      <p>Choose a vehicle, lock in a seed, and roll out with the family already buckled in.</p>
    `;
    section.append(header);

    const form = document.createElement('form');
    form.className = 'setup-form';
    form.noValidate = true;

    const vehicleFieldset = document.createElement('fieldset');
    vehicleFieldset.className = 'vehicle-options';
    vehicleFieldset.innerHTML = '<legend>Choose your ride</legend>';

    const vehicleImageKeys = {
      minivan: 'ui.vehicleCard.minivan',
      pickup: 'ui.vehicleCard.pickup',
      schoolbus: 'ui.vehicleCard.schoolBus'
    };

    VEHICLES.forEach((vehicle, index) => {
      const id = `vehicle-${vehicle.id}`;
      const wrapper = document.createElement('label');
      wrapper.setAttribute('for', id);
      wrapper.className = 'vehicle-card';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'vehicle';
      radio.id = id;
      radio.value = vehicle.id;
      radio.required = true;
      if (index === 0) {
        radio.checked = true;
      }

      const media = document.createElement('div');
      media.className = 'vehicle-card-media';
      const assetKey = vehicleImageKeys[vehicle.id];
      const asset = assetKey ? assets.get(assetKey) : null;
      if (asset?.src) {
        const img = document.createElement('img');
        img.src = asset.src;
        img.alt = asset.label || `${vehicle.name} illustration`;
        img.loading = 'lazy';
        media.append(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'vehicle-card-placeholder';
        placeholder.textContent = vehicle.name;
        media.append(placeholder);
      }

      const content = document.createElement('div');
      content.className = 'vehicle-card-body';

      const headerRow = document.createElement('div');
      headerRow.className = 'vehicle-card-header';
      headerRow.append(radio);

      const title = document.createElement('strong');
      title.textContent = vehicle.name;
      headerRow.append(title);

      content.append(headerRow);

      const desc = document.createElement('p');
      desc.textContent = vehicle.description;
      content.append(desc);

      const chips = document.createElement('div');
      chips.className = 'inline-chips';
      vehicle.traits.forEach((trait) => {
        const span = document.createElement('span');
        span.textContent = trait;
        chips.append(span);
      });
      content.append(chips);

      const stats = document.createElement('p');
      stats.className = 'vehicle-stats';
      stats.textContent = `Gas ${vehicle.stats.gas}, Snacks ${vehicle.stats.snacks}, Ride ${vehicle.stats.ride}, Cash $${vehicle.stats.money}`;
      content.append(stats);

      wrapper.append(media, content);
      vehicleFieldset.append(wrapper);
    });

    form.append(vehicleFieldset);

    const seedRow = document.createElement('div');
    seedRow.className = 'form-row';
    const seedLabel = document.createElement('label');
    seedLabel.setAttribute('for', 'seed');
    seedLabel.textContent = 'Seed';
    const seedInput = document.createElement('input');
    seedInput.id = 'seed';
    seedInput.name = 'seed';
    seedInput.type = 'text';
    seedInput.inputMode = 'numeric';
    seedInput.required = true;
    seedInput.value = generateSeed();
    seedInput.setAttribute('aria-describedby', 'seed-help');
    const seedHelp = document.createElement('small');
    seedHelp.id = 'seed-help';
    seedHelp.textContent = 'The same seed guarantees the same encounters, every time.';

    const randomizeButton = document.createElement('button');
    randomizeButton.type = 'button';
    randomizeButton.className = 'secondary';
    randomizeButton.textContent = 'Randomize seed';
    randomizeButton.addEventListener('click', () => {
      seedInput.value = generateSeed();
      seedInput.focus({ preventScroll: true });
    });

    seedRow.append(seedLabel, seedInput, seedHelp, randomizeButton);
    form.append(seedRow);

    const partyFieldset = document.createElement('fieldset');
    partyFieldset.innerHTML = '<legend>Family on board</legend>';

    const partyIntro = document.createElement('p');
    partyIntro.textContent = 'This crew is ready to roll:';

    const rosterList = document.createElement('ul');
    rosterList.className = 'family-roster';
    FAMILY_NAMES.forEach((name) => {
      const item = document.createElement('li');
      item.textContent = name;
      rosterList.append(item);
    });

    partyFieldset.append(partyIntro, rosterList);
    form.append(partyFieldset);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Hit the road';
    form.append(submit);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const vehicleId = formData.get('vehicle');
      const seedValue = Number(formData.get('seed'));
      await this.gameState.startNewRun({ seed: seedValue, vehicleId });
      this.screenManager.navigate('map');
    });

    section.append(form);

    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'secondary';
    backButton.textContent = 'Back to title';
    backButton.addEventListener('click', () => {
      this.screenManager.navigate('title');
    });
    section.append(backButton);

    return section;
  }
}
