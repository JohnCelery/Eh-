export default class EndScreen {
  constructor({ screenManager, gameState }) {
    this.screenManager = screenManager;
    this.gameState = gameState;
  }

  bind() {}

  async render() {
    const section = document.createElement('section');
    section.className = 'screen end-screen';
    section.setAttribute('aria-labelledby', 'end-screen-heading');

    const snapshot = this.gameState.getSnapshot();
    const header = document.createElement('div');
    header.className = 'screen-header';
    header.innerHTML = `
      <h2 id="end-screen-heading">Trail Complete</h2>
      <p>The odometer stops, for now. Compare your log, share your seed, and plan the next lap across Canada.</p>
    `;
    section.append(header);

    if (snapshot) {
      const summary = document.createElement('p');
      summary.textContent = `You travelled for ${snapshot.day} days driving the ${snapshot.vehicle.name}.`;
      section.append(summary);

      const list = document.createElement('ul');
      list.setAttribute('aria-label', 'Final resources');
      Object.entries(snapshot.resources).forEach(([key, value]) => {
        const li = document.createElement('li');
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        li.textContent = `${label}: ${value}`;
        list.append(li);
      });
      section.append(list);
    }

    const restart = document.createElement('button');
    restart.type = 'button';
    restart.textContent = 'Return to title';
    restart.addEventListener('click', () => {
      this.screenManager.navigate('title');
    });
    section.append(restart);

    return section;
  }
}
