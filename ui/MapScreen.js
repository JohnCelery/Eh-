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
    this.stageElement = null;
    this.mapCanvas = null;
    this.mapContext = null;
    this.mapArea = null;
    this.logList = null;
    this.locationDetails = null;
    this.a11yList = null;
    this.activeConnections = [];
    this.currentSnapshot = null;
    this.stageSize = { width: 0, height: 0 };
    this.resizeObserver = null;

    this._handleKeydown = this._handleKeydown.bind(this);
  }

  bind() {}

  async render() {
    if (!this.section) {
      this.section = this._build();
    }
    this._refresh();
    window.requestAnimationFrame(() => {
      this._syncCanvasSize();
    });
    return this.section;
  }

  activate() {
    document.body.classList.add('map-mode');
    this._refresh();
    this._syncCanvasSize();
    document.addEventListener('keydown', this._handleKeydown);
  }

  deactivate() {
    document.body.classList.remove('map-mode');
    document.removeEventListener('keydown', this._handleKeydown);
  }

  _build() {
    const section = document.createElement('section');
    section.className = 'screen map-screen';
    section.setAttribute('aria-labelledby', 'map-screen-heading');

    const topbar = document.createElement('header');
    topbar.className = 'map-topbar';

    const headingGroup = document.createElement('div');
    headingGroup.className = 'map-heading';
    headingGroup.innerHTML = `
      <h2 id="map-screen-heading">Canadian Trail Atlas</h2>
      <p>Chart a single sweeping view of Canada. Focus a location to hear its details, then press Enter to travel.</p>
    `;
    topbar.append(headingGroup);

    this.resourceBoard = document.createElement('div');
    this.resourceBoard.className = 'map-resources';
    topbar.append(this.resourceBoard);

    section.append(topbar);

    const layout = document.createElement('div');
    layout.className = 'map-layout';

    this.stageElement = document.createElement('div');
    this.stageElement.className = 'map-stage';
    this.stageElement.setAttribute('role', 'application');
    this.stageElement.setAttribute('aria-label', 'Road map with travel nodes');

    const instructions = document.createElement('p');
    instructions.id = 'map-stage-instructions';
    instructions.className = 'sr-only';
    instructions.textContent = 'Use Tab to move between map locations. Press Enter or Space to travel to an available node.';
    this.stageElement.setAttribute('aria-describedby', instructions.id);

    const srConnections = document.createElement('ul');
    srConnections.className = 'sr-only';
    srConnections.id = 'map-stage-connections';
    srConnections.setAttribute('aria-live', 'polite');
    this.a11yList = srConnections;

    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.className = 'map-canvas';
    this.mapCanvas.setAttribute('aria-hidden', 'true');
    this.mapContext = this.mapCanvas.getContext('2d');

    this.mapArea = document.createElement('div');
    this.mapArea.className = 'map-node-layer';

    this.stageElement.append(instructions, srConnections, this.mapCanvas, this.mapArea);

    layout.append(this.stageElement);

    const sidebar = document.createElement('aside');
    sidebar.className = 'map-sidebar';

    this.locationDetails = document.createElement('section');
    this.locationDetails.className = 'map-location';
    sidebar.append(this.locationDetails);

    const logPanel = document.createElement('section');
    logPanel.className = 'map-log';
    logPanel.innerHTML = '<h3>Road log</h3>';
    this.logList = document.createElement('ul');
    this.logList.className = 'map-log-list';
    logPanel.append(this.logList);
    sidebar.append(logPanel);

    layout.append(sidebar);
    section.append(layout);

    this._renderNodes();

    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this._syncCanvasSize();
      });
    }
    this.resizeObserver.observe(this.stageElement);

    return section;
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
      button.setAttribute('aria-label', this._describeNode(node));
      button.title = node.name;
      const label = document.createElement('span');
      label.className = 'map-node-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = node.shortName || node.name;
      button.append(label);
      button.addEventListener('click', () => {
        this._handleNodeClick(node.id);
      });
      this.mapArea.append(button);
    });
  }

  _syncCanvasSize() {
    if (!this.stageElement || !this.mapCanvas) {
      return;
    }
    const rect = this.stageElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);

    if (this.mapCanvas.width !== width || this.mapCanvas.height !== height) {
      this.mapCanvas.width = width;
      this.mapCanvas.height = height;
    }
    this.mapCanvas.style.width = `${rect.width}px`;
    this.mapCanvas.style.height = `${rect.height}px`;

    if (this.mapContext) {
      this.mapContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    this.stageSize = { width: rect.width, height: rect.height };
    this._drawCanvas();
  }

  _drawCanvas() {
    if (!this.mapContext || !this.stageSize.width || !this.stageSize.height) {
      return;
    }

    const ctx = this.mapContext;
    const { width, height } = this.stageSize;
    ctx.clearRect(0, 0, width, height);

    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#05142a');
    background.addColorStop(0.55, '#09335c');
    background.addColorStop(1, '#0b6dca');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    const aurora = ctx.createLinearGradient(0, height * 0.12, width, height * 0.45);
    aurora.addColorStop(0, 'rgba(123, 198, 255, 0.42)');
    aurora.addColorStop(1, 'rgba(239, 108, 51, 0.35)');
    ctx.fillStyle = aurora;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.18);
    ctx.bezierCurveTo(width * 0.22, height * 0.05, width * 0.42, height * 0.32, width * 0.6, height * 0.18);
    ctx.bezierCurveTo(width * 0.78, height * 0.08, width * 0.92, height * 0.2, width, height * 0.12);
    ctx.lineTo(width, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(4, 22, 44, 0.6)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.72);
    ctx.bezierCurveTo(width * 0.24, height * 0.6, width * 0.4, height * 0.88, width * 0.62, height * 0.78);
    ctx.bezierCurveTo(width * 0.78, height * 0.7, width * 0.9, height * 0.92, width, height * 0.78);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const highlightEdges = new Set();
    if (this.currentSnapshot?.location && Array.isArray(this.activeConnections)) {
      const currentId = this.currentSnapshot.location;
      this.activeConnections.forEach((entry) => {
        highlightEdges.add(this._edgeKey(currentId, entry.node.id));
        highlightEdges.add(this._edgeKey(entry.node.id, currentId));
      });
    }

    const drawn = new Set();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1.6, width * 0.008);
    this.graph.edges.forEach((edge) => {
      const key = this._normalizedEdgeKey(edge.from, edge.to);
      if (drawn.has(key)) {
        return;
      }
      drawn.add(key);
      const from = this.graph.nodes.get(edge.from);
      const to = this.graph.nodes.get(edge.to);
      if (!from || !to) {
        return;
      }
      const fromPoint = this._toCanvasCoords(from.coords);
      const toPoint = this._toCanvasCoords(to.coords);
      const gradient = ctx.createLinearGradient(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);
      gradient.addColorStop(0, 'rgba(138, 198, 255, 0.55)');
      gradient.addColorStop(1, 'rgba(108, 158, 224, 0.45)');
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(fromPoint.x, fromPoint.y);
      ctx.lineTo(toPoint.x, toPoint.y);
      ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    ctx.lineCap = 'round';
    const highlighted = new Set();
    this.graph.edges.forEach((edge) => {
      const key = this._normalizedEdgeKey(edge.from, edge.to);
      if (highlighted.has(key)) {
        return;
      }
      const forwardKey = this._edgeKey(edge.from, edge.to);
      const backwardKey = this._edgeKey(edge.to, edge.from);
      if (!highlightEdges.has(forwardKey) && !highlightEdges.has(backwardKey)) {
        return;
      }
      highlighted.add(key);
      const from = this.graph.nodes.get(edge.from);
      const to = this.graph.nodes.get(edge.to);
      if (!from || !to) {
        return;
      }
      const fromPoint = this._toCanvasCoords(from.coords);
      const toPoint = this._toCanvasCoords(to.coords);
      ctx.strokeStyle = 'rgba(255, 214, 153, 0.9)';
      ctx.lineWidth = Math.max(3, width * 0.012);
      ctx.shadowColor = 'rgba(255, 199, 120, 0.6)';
      ctx.shadowBlur = Math.max(18, width * 0.05);
      ctx.beginPath();
      ctx.moveTo(fromPoint.x, fromPoint.y);
      ctx.lineTo(toPoint.x, toPoint.y);
      ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    this.graph.nodes.forEach((node) => {
      const point = this._toCanvasCoords(node.coords);
      const isCurrent = this.currentSnapshot?.location === node.id;
      const isReachable = this.activeConnections?.some((entry) => entry.node.id === node.id);
      const visited = this.currentSnapshot?.visited?.includes(node.id);
      const base = Math.max(width, height);
      const radius = isCurrent ? base * 0.06 : isReachable ? base * 0.045 : base * 0.035;
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      if (isCurrent) {
        gradient.addColorStop(0, 'rgba(255, 233, 179, 0.95)');
        gradient.addColorStop(0.5, 'rgba(255, 199, 120, 0.6)');
        gradient.addColorStop(1, 'rgba(255, 199, 120, 0)');
      } else if (isReachable) {
        gradient.addColorStop(0, 'rgba(123, 198, 255, 0.9)');
        gradient.addColorStop(1, 'rgba(123, 198, 255, 0)');
      } else if (visited) {
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      } else {
        gradient.addColorStop(0, 'rgba(94, 142, 203, 0.22)');
        gradient.addColorStop(1, 'rgba(94, 142, 203, 0)');
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  _edgeKey(from, to) {
    return `${from}::${to}`;
  }

  _normalizedEdgeKey(from, to) {
    return [from, to].sort().join('::');
  }

  _toCanvasCoords(coords = { x: 0, y: 0 }) {
    const { width, height } = this.stageSize;
    if (!width || !height) {
      return { x: 0, y: 0 };
    }
    const x = ((coords.x ?? 0) / 100) * width;
    const y = ((coords.y ?? 0) / 100) * height;
    return { x, y };
  }

  _describeNode(node) {
    if (!node) {
      return '';
    }
    const segments = [node.name];
    if (node.region) {
      segments.push(`Region: ${node.region}`);
    }
    if (Array.isArray(node.actions) && node.actions.length) {
      const actionNames = node.actions
        .map((action) => this._describeAction(action).title)
        .join(', ');
      if (actionNames) {
        segments.push(`Camp options: ${actionNames}`);
      }
    }
    return segments.join('. ');
  }

  _refresh() {
    const snapshot = this.gameState.getSnapshot();
    if (!snapshot) {
      return;
    }
    this.currentSnapshot = snapshot;
    this._updateResourceBoard(snapshot);
    this._updateNodes(snapshot);
    this._updateLocation(snapshot);
    this._updateLog(snapshot);
    this._drawCanvas();
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
    const visitedIds = new Set(Array.isArray(snapshot.visited) ? snapshot.visited : []);
    this.activeConnections = activeConnections;

    this.mapArea.querySelectorAll('.map-node').forEach((button) => {
      const nodeId = button.dataset.nodeId;
      const isCurrent = nodeId === currentId;
      button.dataset.current = String(isCurrent);
      const isActive = activeIds.has(nodeId);
      button.dataset.active = String(isActive);
      button.dataset.reachable = String(isActive && !isCurrent);
      button.dataset.visited = String(visitedIds.has(nodeId));
      button.disabled = !isActive;
      if (isCurrent) {
        button.setAttribute('aria-current', 'true');
      } else {
        button.removeAttribute('aria-current');
      }
    });

    if (this.a11yList) {
      this.a11yList.innerHTML = '';
      const currentNode = this.graph.nodes.get(currentId);
      if (currentNode) {
        const currentItem = document.createElement('li');
        const region = currentNode.region ? ` in ${currentNode.region}` : '';
        currentItem.textContent = `Current location: ${currentNode.name}${region}.`;
        this.a11yList.append(currentItem);
      }

      if (activeConnections.length) {
        activeConnections.forEach((entry) => {
          const { node, link } = entry;
          const gasCost = Math.max(1, Math.round(link?.distance || 1));
          const region = node.region ? ` in ${node.region}` : '';
          const roughText = link?.rough ? ' via a rough road' : '';
          const item = document.createElement('li');
          item.textContent = `Route to ${node.name}${region} costs ${gasCost} fuel${roughText}.`;
          this.a11yList.append(item);
        });
      } else {
        const noRoutes = document.createElement('li');
        noRoutes.textContent = 'No reachable destinations from this location yet.';
        this.a11yList.append(noRoutes);
      }
    }
  }

  _updateLocation(snapshot) {
    const node = this.graph.nodes.get(snapshot.location);
    if (!node || !this.locationDetails) {
      return;
    }
    this.locationDetails.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'map-location-header';

    const title = document.createElement('h3');
    title.textContent = node.name;
    header.append(title);

    const region = document.createElement('p');
    region.className = 'map-location-region';
    region.textContent = node.region || 'Somewhere along the Trans-Canada';
    header.append(region);

    this.locationDetails.append(header);

    if (Array.isArray(node.actions) && node.actions.length) {
      const actionSection = document.createElement('div');
      actionSection.className = 'map-action-section';

      const actionLabel = document.createElement('p');
      actionLabel.className = 'map-section-label';
      actionLabel.textContent = 'Camp options';
      actionSection.append(actionLabel);

      const actionList = document.createElement('ul');
      actionList.className = 'map-action-list';
      actionList.setAttribute('aria-label', 'Available actions');
      node.actions.forEach((action) => {
        const { title: actionTitle, description } = this._describeAction(action);
        const li = document.createElement('li');
        const strong = document.createElement('strong');
        strong.textContent = actionTitle;
        li.append(strong);
        if (description) {
          const span = document.createElement('span');
          span.textContent = description;
          li.append(span);
        }
        actionList.append(li);
      });
      actionSection.append(actionList);
      this.locationDetails.append(actionSection);
    }

    if (this.activeConnections.length) {
      const routeSection = document.createElement('div');
      routeSection.className = 'map-route-section';

      const routeLabel = document.createElement('p');
      routeLabel.className = 'map-section-label';
      routeLabel.textContent = 'Reachable routes';
      routeSection.append(routeLabel);

      const routeList = document.createElement('ul');
      routeList.className = 'map-route-list';
      routeList.setAttribute('aria-label', 'Reachable destinations');

      this.activeConnections.forEach((entry) => {
        const { node: nextNode, link } = entry;
        const li = document.createElement('li');

        const heading = document.createElement('strong');
        heading.textContent = nextNode.name;
        li.append(heading);

        const metaBits = [];
        if (link?.label) {
          metaBits.push(link.label);
        }
        if (link?.distance) {
          const gasCost = Math.max(1, Math.round(link.distance));
          metaBits.push(`${gasCost} fuel`);
        }
        if (link?.rough) {
          metaBits.push('Rough road');
        }

        if (metaBits.length) {
          const detail = document.createElement('span');
          detail.textContent = metaBits.join(' • ');
          li.append(detail);
        }

        routeList.append(li);
      });

      routeSection.append(routeList);
      this.locationDetails.append(routeSection);
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
        return {
          title: 'Siphon',
          description: 'Trade time for gas at risk of fumes.'
        };
      case 'forage':
        return {
          title: 'Forage',
          description: 'Scout nearby forests for berries and jerky.'
        };
      case 'tinker':
        return {
          title: 'Tinker',
          description: 'Repair the ride with spare parts and elbow grease.'
        };
      case 'ferry':
        return {
          title: 'Ferry',
          description: 'Pay a toll to cross water safely.'
        };
      case 'town':
        return {
          title: 'Town',
          description: 'Visit shops and upgrade stands (coming soon).'
        };
      default:
        return {
          title: action.charAt(0).toUpperCase() + action.slice(1),
          description: ''
        };
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

  _handleKeydown(event) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }
    if (!this.section || !this.mapArea) {
      return;
    }
    if (!this.section.contains(document.activeElement)) {
      return;
    }
    const focusableNodes = Array.from(this.mapArea.querySelectorAll('.map-node:not([disabled])'));
    if (!focusableNodes.length) {
      return;
    }
    const currentIndex = focusableNodes.indexOf(document.activeElement);
    let targetIndex;
    if (currentIndex === -1) {
      targetIndex = 0;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (currentIndex + 1) % focusableNodes.length;
    } else {
      targetIndex = (currentIndex - 1 + focusableNodes.length) % focusableNodes.length;
    }
    focusableNodes[targetIndex].focus();
    event.preventDefault();
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
