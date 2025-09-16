import { getConnections } from '../systems/graph.js';

export default class MapScreen {
  constructor({ screenManager, gameState, graph, eventEngine, eventModal }) {
    this.screenManager = screenManager;
    this.gameState = gameState;
    this.graph = graph;
    this.eventEngine = eventEngine;
    this.eventModal = eventModal;

    this.section = null;
    this.resourceBoard = null;
    this.mapArea = null;
    this.logList = null;
    this.locationDetails = null;
  }

  bind() {}

  async render() {
    if (!this.section) {
      this.section = this._build();
    }
    this._refresh();
    return this.section;
  }

  activate() {
    this._refresh();
  }

  _build() {
    const section = document.createElement('section');
    section.className = 'screen map-screen';
    section.setAttribute('aria-labelledby', 'map-screen-heading');

    const header = document.createElement('div');
    header.className = 'screen-header';
    header.innerHTML = `
      <h2 id="map-screen-heading">Canadian Trail Atlas</h2>
      <p>Plot your next hop across the provinces. Click an adjacent node to spend fuel, munch snacks, and advance the day.</p>
    `;
    section.append(header);

    this.resourceBoard = document.createElement('div');
    this.resourceBoard.className = 'resource-board';
    section.append(this.resourceBoard);

    const mapWrapper = document.createElement('div');
    mapWrapper.className = 'map-wrapper';

    this.mapArea = document.createElement('div');
    this.mapArea.className = 'map-area';
    this.mapArea.setAttribute('role', 'application');
    this.mapArea.setAttribute('aria-label', 'Road map with travel nodes');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 60');
    svg.setAttribute('aria-hidden', 'true');
    this.mapArea.append(svg);

    this.locationDetails = document.createElement('div');
    this.locationDetails.className = 'location-details';

    mapWrapper.append(this.mapArea, this.locationDetails);
    section.append(mapWrapper);

    const logPanel = document.createElement('div');
    logPanel.className = 'log-panel';
    logPanel.innerHTML = '<h3>Road log</h3>';
    this.logList = document.createElement('ul');
    logPanel.append(this.logList);
    section.append(logPanel);

    this._renderEdges(svg);
    this._renderNodes();

    return section;
  }

  _renderEdges(svg) {
    svg.innerHTML = '';
    this.graph.edges.forEach((edge) => {
      const from = this.graph.nodes.get(edge.from);
      const to = this.graph.nodes.get(edge.to);
      if (!from || !to) {
        return;
      }
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.coords.x);
      line.setAttribute('y1', from.coords.y);
      line.setAttribute('x2', to.coords.x);
      line.setAttribute('y2', to.coords.y);
      line.setAttribute('stroke', 'rgba(8, 77, 140, 0.4)');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-linecap', 'round');
      svg.append(line);
    });
  }

  _renderNodes() {
    const existingButtons = this.mapArea.querySelectorAll('.map-node');
    existingButtons.forEach((node) => node.remove());

    this.graph.nodes.forEach((node) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-node';
      button.dataset.nodeId = node.id;
      button.style.left = `${node.coords.x}%`;
      button.style.top = `${node.coords.y}%`;
      button.textContent = node.shortName || node.name;
      button.addEventListener('click', () => {
        this._handleNodeClick(node.id);
      });
      this.mapArea.append(button);
    });
  }

  _refresh() {
    const snapshot = this.gameState.getSnapshot();
    if (!snapshot) {
      return;
    }
    this._updateResourceBoard(snapshot);
    this._updateNodes(snapshot);
    this._updateLocation(snapshot);
    this._updateLog(snapshot);
  }

  _updateResourceBoard(snapshot) {
    const { resources, day, vehicle } = snapshot;
    this.resourceBoard.innerHTML = '';

    const dayTrack = document.createElement('div');
    dayTrack.className = 'resource-track';
    dayTrack.innerHTML = `<span>Day</span><strong>${day}</strong>`;
    this.resourceBoard.append(dayTrack);

    Object.entries(resources).forEach(([key, value]) => {
      const track = document.createElement('div');
      track.className = 'resource-track';
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      const max = snapshot.maxResources?.[key] ?? '';
      track.innerHTML = `<span>${label}</span><strong>${value}${max ? `<small>/ ${max}</small>` : ''}</strong>`;
      this.resourceBoard.append(track);
    });

    const vehicleCard = document.createElement('div');
    vehicleCard.className = 'resource-track';
    vehicleCard.innerHTML = `<span>Ride</span><strong>${vehicle.name}</strong>`;
    this.resourceBoard.append(vehicleCard);
  }

  _updateNodes(snapshot) {
    const currentId = snapshot.location;
    const activeConnections = getConnections(this.graph, currentId);
    const activeIds = new Set([currentId, ...activeConnections.map((entry) => entry.node.id)]);

    this.mapArea.querySelectorAll('.map-node').forEach((button) => {
      const nodeId = button.dataset.nodeId;
      const isCurrent = nodeId === currentId;
      button.dataset.current = String(isCurrent);
      const isActive = activeIds.has(nodeId);
      button.dataset.active = String(isActive);
      button.disabled = !isActive || isCurrent;
    });
  }

  _updateLocation(snapshot) {
    const node = this.graph.nodes.get(snapshot.location);
    if (!node || !this.locationDetails) {
      return;
    }
    this.locationDetails.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = node.name;
    this.locationDetails.append(title);

    const region = document.createElement('p');
    region.textContent = node.region || 'Somewhere along the Trans-Canada';
    this.locationDetails.append(region);

    if (Array.isArray(node.actions) && node.actions.length) {
      const actionList = document.createElement('ul');
      actionList.setAttribute('aria-label', 'Available actions');
      node.actions.forEach((action) => {
        const li = document.createElement('li');
        li.textContent = this._describeAction(action);
        actionList.append(li);
      });
      this.locationDetails.append(actionList);
    }
  }

  _updateLog(snapshot) {
    if (!this.logList) {
      return;
    }
    this.logList.innerHTML = '';
    const recent = [...snapshot.log].slice(-8).reverse();
    recent.forEach((entry) => {
      const li = document.createElement('li');
      li.textContent = entry;
      this.logList.append(li);
    });
  }

  _describeAction(action) {
    switch (action) {
      case 'siphon':
        return 'Siphon: Trade time for gas at risk of fumes.';
      case 'forage':
        return 'Forage: Scout nearby forests for berries and jerky.';
      case 'tinker':
        return 'Tinker: Repair the ride with spare parts and elbow grease.';
      case 'ferry':
        return 'Ferry: Pay a toll to cross water safely.';
      case 'town':
        return 'Town: Visit shops and upgrade stands (coming soon).';
      default:
        return action;
    }
  }

  _handleNodeClick(nodeId) {
    const snapshot = this.gameState.getSnapshot();
    if (!snapshot) {
      return;
    }
    const currentId = snapshot.location;
    if (currentId === nodeId) {
      return;
    }
    const connections = getConnections(this.graph, currentId);
    const target = connections.find((entry) => entry.node.id === nodeId);
    if (!target) {
      return;
    }

    const result = this.gameState.travelTo(nodeId, {
      distance: target.link.distance,
      roughRoad: target.link.rough,
      fromName: this.graph.nodes.get(currentId)?.name,
      toName: target.node.name
    });

    this._refresh();

    if (result?.depleted?.length) {
      this.eventModal.showOutcome(`Resources running low: ${result.depleted.join(', ')}`);
    }

    const event = this.eventEngine.maybeTrigger('travel', this.gameState);
    if (event) {
      this.gameState.appendLog(`Encountered: ${event.title || 'an event'}.`);
      this.eventModal.open(event, {
        onChoice: (choice) => this._resolveEventChoice(event, choice),
        onClose: () => {
          this._refresh();
        }
      });
    }
  }

  _resolveEventChoice(event, choice) {
    try {
      const result = this.eventEngine.resolveChoice(event.id, choice.id, this.gameState);
      const outcomeText = result.outcome || 'The road rolls on.';
      this.eventModal.showOutcome(outcomeText);
      this._refresh();
    } catch (error) {
      console.error('Failed to resolve event choice', error);
      this.eventModal.showOutcome('That choice is still under construction.');
    }
  }
}
