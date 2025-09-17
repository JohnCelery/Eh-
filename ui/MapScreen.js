import { getConnections } from '../systems/graph.js';
import TravelBanner from './TravelBanner.js';

const TIME_LABELS = ['Morning', 'Midday', 'Evening', 'Night'];

function formatRange(range = { min: 0, max: 0 }, resource) {
  if (!range) {
    return '';
  }
  const { min = 0, max = 0 } = range;
  if (min === max) {
    return `${resource} ${min >= 0 ? '+' : ''}${min}`;
  }
  return `${resource} ${min >= 0 ? '+' : ''}${min}–${max}`;
}

export default class MapScreen {
  constructor({ screenManager, gameState, eventEngine, eventModal }) {
    this.screenManager = screenManager;
    this.gameState = gameState;
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
    this.graph = null;

    this.previewCard = null;
    this.previewTitle = null;
    this.previewSubtitle = null;
    this.previewStats = null;
    this.previewYields = null;
    this.previewActions = null;
    this.previewConfirmButton = null;
    this.previewDismissButton = null;
    this.actionFeedback = null;
    this.activePreviewTarget = null;
    this.pendingTravelNodeId = null;
    this.suppressPeekTarget = null;

    this.mapSidebar = null;
    this.mobileControls = null;
    this.mobileToggleButtons = [];
    this.mobileTabButtons = new Map();
    this.mobileCloseButton = null;
    this.mobileDrawerOpen = false;
    this.mobileActivePanel = 'status';
    this.mobileResourceBoard = null;
    this.mapLogSection = null;
    this.mobileTriggerButton = null;
    this.locationBody = null;
    this.mobileViewportQuery = null;
    this._boundMediaListener = null;
    this.instanceId = `map-${Math.random().toString(36).slice(2, 8)}`;

    this.travelBanner = null;
    this.travelBannerContainer = null;
    this.activeTravelEncounter = null;
    this.activeArrivalEncounter = null;

    this._handleKeydown = this._handleKeydown.bind(this);
    this._handleViewportResize = this._handleViewportResize.bind(this);
  }

  bind() {}

  async render() {
    await this.gameState.ensureWorldReady();
    this.graph = this.gameState.getWorldGraph();
    if (!this.section) {
      this.section = this._build();
    } else {
      this._renderNodes();
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
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._handleViewportResize);
    }
    this._updateSidebarAria();
  }

  deactivate() {
    document.body.classList.remove('map-mode');
    document.removeEventListener('keydown', this._handleKeydown);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this._handleViewportResize);
    }
    this._closeMobileDrawer(null, { restoreFocus: false });
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

    this.travelBannerContainer = document.createElement('div');
    this.travelBannerContainer.className = 'travel-banner-slot';
    section.append(this.travelBannerContainer);

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

    this.previewCard = document.createElement('div');
    this.previewCard.className = 'map-preview';
    this.previewCard.setAttribute('aria-live', 'polite');
    this.previewCard.dataset.visible = 'false';
    this.previewCard.dataset.mode = 'peek';
    const previewHeading = document.createElement('h4');
    previewHeading.className = 'map-preview-title';
    const previewSubtitle = document.createElement('p');
    previewSubtitle.className = 'map-preview-subtitle';
    const previewStats = document.createElement('dl');
    previewStats.className = 'map-preview-stats';
    const previewYields = document.createElement('div');
    previewYields.className = 'map-preview-yields';
    const previewActions = document.createElement('div');
    previewActions.className = 'map-preview-actions';
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'map-preview-confirm';
    confirmButton.textContent = 'Travel';
    confirmButton.disabled = true;
    confirmButton.addEventListener('click', () => {
      if (this.pendingTravelNodeId) {
        this._confirmTravel(this.pendingTravelNodeId);
      }
    });
    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'map-preview-dismiss';
    dismissButton.textContent = 'Cancel';
    dismissButton.addEventListener('click', () => {
      this._dismissTravelPreview();
    });
    previewActions.append(confirmButton, dismissButton);
    this.previewCard.append(previewHeading, previewSubtitle, previewStats, previewYields, previewActions);
    this.previewTitle = previewHeading;
    this.previewSubtitle = previewSubtitle;
    this.previewStats = previewStats;
    this.previewYields = previewYields;
    this.previewActions = previewActions;
    this.previewConfirmButton = confirmButton;
    this.previewDismissButton = dismissButton;

    this.stageElement.append(instructions, srConnections, this.mapCanvas, this.mapArea, this.previewCard);

    if (!this.travelBanner) {
      this.travelBanner = new TravelBanner(this.travelBannerContainer);
    }

    this.mobileControls = document.createElement('div');
    this.mobileControls.className = 'map-mobile-controls';
    const statusToggle = document.createElement('button');
    statusToggle.type = 'button';
    statusToggle.className = 'map-mobile-button';
    statusToggle.dataset.target = 'status';
    statusToggle.textContent = 'Status';
    statusToggle.setAttribute('aria-expanded', 'false');
    statusToggle.addEventListener('click', () => {
      this._toggleMobileDrawer('status', statusToggle);
    });
    const logToggle = document.createElement('button');
    logToggle.type = 'button';
    logToggle.className = 'map-mobile-button';
    logToggle.dataset.target = 'log';
    logToggle.textContent = 'Road log';
    logToggle.setAttribute('aria-expanded', 'false');
    logToggle.addEventListener('click', () => {
      this._toggleMobileDrawer('log', logToggle);
    });
    this.mobileControls.append(statusToggle, logToggle);
    this.mobileToggleButtons = [statusToggle, logToggle];
    this.stageElement.append(this.mobileControls);

    layout.append(this.stageElement);

    const sidebar = document.createElement('aside');
    sidebar.className = 'map-sidebar';
    sidebar.dataset.open = 'false';
    sidebar.setAttribute('role', 'complementary');
    this.mapSidebar = sidebar;

    const statusPanelId = `${this.instanceId}-panel-status`;
    const logPanelId = `${this.instanceId}-panel-log`;
    const statusTabId = `${this.instanceId}-tab-status`;
    const logTabId = `${this.instanceId}-tab-log`;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'map-mobile-close';
    closeButton.textContent = 'Close';
    closeButton.setAttribute('aria-label', 'Close journey details');
    closeButton.addEventListener('click', () => {
      this._closeMobileDrawer();
    });
    sidebar.append(closeButton);
    this.mobileCloseButton = closeButton;

    const tablist = document.createElement('div');
    tablist.className = 'map-mobile-tabs';
    tablist.setAttribute('role', 'tablist');
    const statusTab = document.createElement('button');
    statusTab.type = 'button';
    statusTab.className = 'map-mobile-tab';
    statusTab.id = statusTabId;
    statusTab.dataset.panel = 'status';
    statusTab.setAttribute('role', 'tab');
    statusTab.setAttribute('aria-selected', 'true');
    statusTab.setAttribute('aria-controls', statusPanelId);
    statusTab.setAttribute('tabindex', '0');
    statusTab.textContent = 'Status';
    statusTab.addEventListener('click', () => {
      this._setMobilePanel('status');
    });
    const logTab = document.createElement('button');
    logTab.type = 'button';
    logTab.className = 'map-mobile-tab';
    logTab.id = logTabId;
    logTab.dataset.panel = 'log';
    logTab.setAttribute('role', 'tab');
    logTab.setAttribute('aria-selected', 'false');
    logTab.setAttribute('aria-controls', logPanelId);
    logTab.setAttribute('tabindex', '-1');
    logTab.textContent = 'Road log';
    logTab.addEventListener('click', () => {
      this._setMobilePanel('log');
    });
    tablist.append(statusTab, logTab);
    sidebar.append(tablist);
    this.mobileTabButtons.set('status', statusTab);
    this.mobileTabButtons.set('log', logTab);

    this.locationDetails = document.createElement('section');
    this.locationDetails.className = 'map-location';
    this.locationDetails.id = statusPanelId;
    this.locationDetails.setAttribute('role', 'tabpanel');
    this.locationDetails.setAttribute('aria-labelledby', statusTabId);
    this.locationDetails.dataset.panel = 'status';
    this.locationDetails.dataset.active = 'true';
    this.mobileResourceBoard = document.createElement('div');
    this.mobileResourceBoard.className = 'map-resources map-resources-mobile';
    this.locationBody = document.createElement('div');
    this.locationBody.className = 'map-location-body';
    this.locationDetails.append(this.mobileResourceBoard, this.locationBody);
    sidebar.append(this.locationDetails);

    const logPanel = document.createElement('section');
    logPanel.className = 'map-log';
    logPanel.id = logPanelId;
    logPanel.setAttribute('role', 'tabpanel');
    logPanel.setAttribute('aria-labelledby', logTabId);
    logPanel.dataset.panel = 'log';
    logPanel.dataset.active = 'false';
    logPanel.setAttribute('aria-hidden', 'true');
    logPanel.innerHTML = '<h3>Road log</h3>';
    this.logList = document.createElement('ul');
    this.logList.className = 'map-log-list';
    logPanel.append(this.logList);
    sidebar.append(logPanel);
    this.mapLogSection = logPanel;

    this.mobileToggleButtons.forEach((button) => {
      if (button.dataset.target === 'status') {
        button.setAttribute('aria-controls', statusPanelId);
      } else if (button.dataset.target === 'log') {
        button.setAttribute('aria-controls', logPanelId);
      }
    });

    layout.append(sidebar);
    section.append(layout);

    if (typeof window !== 'undefined' && !this.mobileViewportQuery && window.matchMedia) {
      this.mobileViewportQuery = window.matchMedia('(max-width: 720px)');
      this._boundMediaListener = (event) => {
        this._updateSidebarAria(event.matches);
      };
      if (this.mobileViewportQuery.addEventListener) {
        this.mobileViewportQuery.addEventListener('change', this._boundMediaListener);
      } else if (this.mobileViewportQuery.addListener) {
        this.mobileViewportQuery.addListener(this._boundMediaListener);
      }
    }

    this._applyPanelState();
    this._markActiveMobileButton(this.mobileActivePanel);
    this._updateSidebarAria();

    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this._syncCanvasSize();
      });
    }
    this.resizeObserver.observe(this.stageElement);

    this._renderNodes();

    return section;
  }

  _renderNodes() {
    if (!this.mapArea) {
      return;
    }
    this.mapArea.innerHTML = '';

    this.graph = this.gameState.getWorldGraph();
    if (!this.graph || !this.currentSnapshot) {
      return;
    }

    const nodesToRender = [];
    const currentId = this.currentSnapshot.location;
    const currentNode = this.graph.nodes.get(currentId);
    if (currentNode) {
      nodesToRender.push(currentNode);
    }
    if (Array.isArray(this.activeConnections)) {
      this.activeConnections.forEach((entry) => {
        if (entry?.node) {
          nodesToRender.push(entry.node);
        }
      });
    }

    const rendered = new Set();
    nodesToRender.forEach((node) => {
      if (!node || rendered.has(node.id)) {
        return;
      }
      rendered.add(node.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-node';
      button.dataset.nodeId = node.id;
      if (node.kind) {
        button.dataset.kind = node.kind;
      }
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
      button.addEventListener('mouseenter', () => {
        this._maybePreviewNode(node.id);
      });
      button.addEventListener('focus', () => {
        this._maybePreviewNode(node.id);
      });
      button.addEventListener('mouseleave', () => {
        this._handleNodePointerExit(node.id);
      });
      button.addEventListener('blur', () => {
        this._handleNodePointerExit(node.id);
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
    if (!this.mapContext || !this.stageSize.width || !this.stageSize.height || !this.graph) {
      return;
    }

    const ctx = this.mapContext;
    const { width, height } = this.stageSize;
    const visibleNodes = this._getVisibleNodeIds();
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
      if (!visibleNodes.has(edge.from) || !visibleNodes.has(edge.to)) {
        return;
      }
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
      if (!visibleNodes.has(edge.from) || !visibleNodes.has(edge.to)) {
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
      if (!visibleNodes.has(node.id)) {
        return;
      }
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

  _getVisibleNodeIds() {
    const visible = new Set();
    if (!this.currentSnapshot) {
      return visible;
    }
    const { location, visited } = this.currentSnapshot;
    if (Array.isArray(visited)) {
      visited.forEach((nodeId) => {
        if (nodeId) {
          visible.add(nodeId);
        }
      });
    }
    if (location) {
      visible.add(location);
    }
    if (Array.isArray(this.activeConnections)) {
      this.activeConnections.forEach((entry) => {
        if (entry?.node?.id) {
          visible.add(entry.node.id);
        }
      });
    }
    return visible;
  }

  _limitConnections(connections = []) {
    if (!Array.isArray(connections)) {
      return [];
    }
    if (connections.length <= 4) {
      return connections;
    }
    return connections.slice(0, 4);
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
    if (node.kind) {
      segments.push(`Type: ${node.kind}`);
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
    this.graph = this.gameState.getWorldGraph();
    if (!this.graph) {
      return;
    }
    const snapshot = this.gameState.getSnapshot();
    if (!snapshot) {
      return;
    }
    this.currentSnapshot = snapshot;
    const allConnections = getConnections(this.graph, snapshot.location);
    this.activeConnections = this._limitConnections(allConnections);
    this._renderNodes();
    this._updateResourceBoard(snapshot);
    this._updateNodes(snapshot);
    this._updateLocation(snapshot);
    this._updateLog(snapshot);
    this._drawCanvas();
  }

  _updateResourceBoard(snapshot) {
    const { resources, day, vehicle, timeSegment = 0 } = snapshot;
    const entries = [];

    const timeLabel = TIME_LABELS[timeSegment % TIME_LABELS.length] || '';
    entries.push({ label: 'Day', value: String(day), detail: timeLabel });

    Object.entries(resources).forEach(([key, value]) => {
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      const max = snapshot.maxResources?.[key];
      entries.push({ label, value: String(value), detail: typeof max === 'number' ? `/ ${max}` : '' });
    });

    entries.push({ label: 'Ride', value: vehicle?.name ?? '' });

    this._renderResourceTracks(this.resourceBoard, entries);
    this._renderResourceTracks(this.mobileResourceBoard, entries);
  }

  _renderResourceTracks(container, entries) {
    if (!container) {
      return;
    }
    container.innerHTML = '';
    entries.forEach((entry) => {
      if (!entry) {
        return;
      }
      const track = document.createElement('div');
      track.className = 'resource-track';
      const label = document.createElement('span');
      label.textContent = entry.label ?? '';
      const strong = document.createElement('strong');
      strong.textContent = entry.value ?? '';
      if (entry.detail) {
        strong.append(' ');
        const detail = document.createElement('small');
        detail.textContent = entry.detail;
        strong.append(detail);
      }
      track.append(label, strong);
      container.append(track);
    });
  }

  _updateNodes(snapshot) {
    const currentId = snapshot.location;
    const activeConnections = Array.isArray(this.activeConnections) ? this.activeConnections : [];
    const reachableIds = new Set(activeConnections.map((entry) => entry.node.id));
    const activeIds = new Set([currentId, ...reachableIds]);
    const visitedIds = new Set(Array.isArray(snapshot.visited) ? snapshot.visited : []);

    this.mapArea.querySelectorAll('.map-node').forEach((button) => {
      const nodeId = button.dataset.nodeId;
      const isCurrent = nodeId === currentId;
      button.dataset.current = String(isCurrent);
      const isActive = activeIds.has(nodeId);
      const isReachable = reachableIds.has(nodeId);
      button.dataset.active = String(isActive);
      button.dataset.reachable = String(isReachable && !isCurrent);
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
          const { node } = entry;
          const estimate = this.gameState.getTravelEstimate(currentId, node.id);
          const gasCost = estimate?.gasCost ?? Math.max(1, Math.round(entry.link?.distance || 1));
          const rideRange = estimate?.rideRange?.max ?? (entry.link?.rough ? 2 : 1);
          const region = node.region ? ` in ${node.region}` : '';
          const item = document.createElement('li');
          item.textContent = `Route to ${node.name}${region} costs ${gasCost} fuel with ride risk up to ${rideRange}.`;
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
    if (!node || !this.locationDetails || !this.locationBody) {
      return;
    }
    this.locationBody.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'map-location-header';

    const title = document.createElement('h3');
    title.textContent = node.name;
    header.append(title);

    const region = document.createElement('p');
    region.className = 'map-location-region';
    region.textContent = node.region || 'Somewhere along the Trans-Canada';
    header.append(region);

    if (node.profile) {
      const conditions = document.createElement('p');
      conditions.className = 'map-location-conditions';
      const hazard = node.profile.hazard ?? 0;
      const roughness = node.profile.roughness ?? 1;
      conditions.textContent = `Hazard ${hazard.toFixed(2)} • Terrain ${roughness.toFixed(2)}`;
      header.append(conditions);
    }

    this.locationBody.append(header);

    this.actionFeedback = document.createElement('p');
    this.actionFeedback.className = 'map-action-feedback';
    this.actionFeedback.setAttribute('aria-live', 'polite');
    this.locationBody.append(this.actionFeedback);

    const actions = this.gameState.getActionOptions(node.id).filter((option) => option.definition);

    if (actions.length) {
      const actionSection = document.createElement('div');
      actionSection.className = 'map-action-section';

      const actionLabel = document.createElement('p');
      actionLabel.className = 'map-section-label';
      actionLabel.textContent = 'Camp options';
      actionSection.append(actionLabel);

      const actionList = document.createElement('ul');
      actionList.className = 'map-action-list';
      actionList.setAttribute('aria-label', 'Available actions');
      actions.forEach((action) => {
        const { definition, preview, available, reason, id } = action;
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = definition.title;
        button.disabled = !available;
        button.addEventListener('click', () => {
          this._handleAction(id);
        });
        li.append(button);
        if (definition.description) {
          const desc = document.createElement('span');
          desc.textContent = definition.description;
          li.append(desc);
        }
        if (preview) {
          const previewLine = document.createElement('small');
          const parts = [];
          if (Array.isArray(preview.yields) && preview.yields.length) {
            preview.yields.forEach((yieldEntry) => {
              parts.push(formatRange(yieldEntry, yieldEntry.resource));
            });
          }
          if (Array.isArray(preview.costs) && preview.costs.length) {
            preview.costs.forEach((cost) => {
              const amount = typeof cost.amount === 'number' ? cost.amount : cost.min ?? 0;
              parts.push(`${cost.resource} ${amount ? `-${amount}` : ''}`.trim());
            });
          }
          if (Array.isArray(preview.mishaps) && preview.mishaps.length) {
            preview.mishaps.forEach((mishap) => {
              parts.push(`${mishap.resource} ${mishap.min ?? 0}–${mishap.max ?? 0}`);
            });
          }
          previewLine.textContent = parts.filter(Boolean).join(' • ');
          li.append(previewLine);
        }
        if (!available && reason) {
          const warning = document.createElement('small');
          warning.className = 'map-action-warning';
          warning.textContent = reason;
          li.append(warning);
        }
        actionList.append(li);
      });
      actionSection.append(actionList);
      this.locationBody.append(actionSection);
    }

    const routes = this.activeConnections;
    if (routes.length) {
      const routeSection = document.createElement('div');
      routeSection.className = 'map-route-section';

      const routeLabel = document.createElement('p');
      routeLabel.className = 'map-section-label';
      routeLabel.textContent = 'Reachable routes';
      routeSection.append(routeLabel);

      const routeList = document.createElement('ul');
      routeList.className = 'map-route-list';
      routeList.setAttribute('aria-label', 'Reachable destinations');

      routes.forEach((entry) => {
        const { node: target } = entry;
        const estimate = this.gameState.getTravelEstimate(node.id, target.id);
        const li = document.createElement('li');
        const summary = document.createElement('strong');
        summary.textContent = target.name;
        li.append(summary);
        const detail = document.createElement('span');
        const gas = estimate?.gasCost ?? Math.max(1, Math.round(entry.link?.distance || 1));
        const ride = estimate?.rideRange?.max ?? (entry.link?.rough ? 2 : 1);
        detail.textContent = `Gas ${gas}, Ride risk 0–${ride}`;
        li.append(detail);
        routeList.append(li);
      });

      routeSection.append(routeList);
      this.locationBody.append(routeSection);
    }
  }

  _updateLog(snapshot) {
    this.logList.innerHTML = '';
    const recent = [...snapshot.log].slice(-8).reverse();
    recent.forEach((entry) => {
      const li = document.createElement('li');
      li.textContent = entry;
      this.logList.append(li);
    });
  }

  _toggleMobileDrawer(panelId, triggerButton) {
    if (!this._isMobileView()) {
      return;
    }
    if (!this.mapSidebar) {
      return;
    }
    if (!this.mobileDrawerOpen) {
      if (panelId) {
        this._setMobilePanel(panelId);
      }
      this._openMobileDrawer(triggerButton);
      return;
    }
    if (panelId && panelId !== this.mobileActivePanel) {
      this._setMobilePanel(panelId);
      this._markActiveMobileButton(this.mobileActivePanel);
      return;
    }
    this._closeMobileDrawer(triggerButton);
  }

  _openMobileDrawer(triggerButton) {
    if (!this.mapSidebar) {
      return;
    }
    this.mobileDrawerOpen = true;
    this.mobileTriggerButton = triggerButton || null;
    this._applyPanelState();
    this._updateSidebarAria();
    const activeTab = this.mobileTabButtons.get(this.mobileActivePanel);
    if (activeTab) {
      activeTab.focus({ preventScroll: true });
    } else {
      this.mapSidebar.focus({ preventScroll: true });
    }
  }

  _closeMobileDrawer(triggerButton, options = {}) {
    if (!this.mapSidebar) {
      return;
    }
    const { restoreFocus = true } = options;
    const returnTarget = triggerButton || this.mobileTriggerButton;
    this.mobileDrawerOpen = false;
    this._updateSidebarAria();
    this.mobileTriggerButton = null;
    if (restoreFocus && returnTarget && typeof returnTarget.focus === 'function') {
      returnTarget.focus({ preventScroll: true });
    }
  }

  _setMobilePanel(panelId) {
    if (!panelId || !this.mobileTabButtons.has(panelId)) {
      return;
    }
    this.mobileActivePanel = panelId;
    this.mobileTabButtons.forEach((tab, id) => {
      const isActive = id === panelId;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    this._applyPanelState();
    if (this._isMobileView()) {
      this._updateSidebarAria();
    }
  }

  _markActiveMobileButton(activePanel) {
    const isMobile = this._isMobileView();
    this.mobileToggleButtons.forEach((button) => {
      const isActive = Boolean(isMobile && this.mobileDrawerOpen && activePanel && button.dataset.target === activePanel);
      button.dataset.active = String(isActive);
      button.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    });
  }

  _applyPanelState(forceMatch) {
    const panels = [
      ['status', this.locationDetails],
      ['log', this.mapLogSection]
    ];
    const isMobile = this._isMobileView(forceMatch);
    const activePanel = this.mobileActivePanel || 'status';
    panels.forEach(([panelId, panel]) => {
      if (!panel) {
        return;
      }
      const isActive = !isMobile || panelId === activePanel;
      panel.dataset.active = String(isActive);
      if (isMobile) {
        panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      } else {
        panel.setAttribute('aria-hidden', 'false');
      }
    });
  }

  _updateSidebarAria(forceMatch) {
    if (!this.mapSidebar) {
      return;
    }
    const isMobile = this._isMobileView(forceMatch);
    if (isMobile) {
      this.mapSidebar.dataset.open = this.mobileDrawerOpen ? 'true' : 'false';
      this.mapSidebar.setAttribute('role', 'dialog');
      this.mapSidebar.setAttribute('aria-modal', this.mobileDrawerOpen ? 'true' : 'false');
      this.mapSidebar.setAttribute('aria-hidden', this.mobileDrawerOpen ? 'false' : 'true');
      this.mapSidebar.setAttribute('tabindex', '-1');
      const activeTab = this.mobileTabButtons.get(this.mobileActivePanel);
      if (activeTab?.id) {
        this.mapSidebar.setAttribute('aria-labelledby', activeTab.id);
      } else {
        this.mapSidebar.removeAttribute('aria-labelledby');
      }
    } else {
      this.mapSidebar.dataset.open = 'false';
      this.mapSidebar.setAttribute('role', 'complementary');
      this.mapSidebar.removeAttribute('aria-modal');
      this.mapSidebar.setAttribute('aria-hidden', 'false');
      this.mapSidebar.removeAttribute('tabindex');
      this.mapSidebar.removeAttribute('aria-labelledby');
      this.mobileDrawerOpen = false;
    }
    this._applyPanelState(isMobile);
    this._markActiveMobileButton(this.mobileDrawerOpen ? this.mobileActivePanel : null);
  }

  _handleViewportResize() {
    this._updateSidebarAria();
  }

  _isMobileView(forceMatch) {
    if (typeof forceMatch === 'boolean') {
      return forceMatch;
    }
    if (this.mobileViewportQuery) {
      return this.mobileViewportQuery.matches;
    }
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 720;
    }
    return false;
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
      case 'shop':
        return {
          title: 'Shop',
          description: 'Visit shops and upgrade stands for supplies.'
        };
      case 'scavenge':
        return {
          title: 'Scavenge',
          description: 'Pick over the area for lost coins and parts.'
        };
      default:
        return {
          title: action.charAt(0).toUpperCase() + action.slice(1),
          description: ''
        };
    }
  }

  _handleNodeClick(nodeId) {
    const snapshot = this.currentSnapshot || this.gameState.getSnapshot();
    if (!snapshot) {
      return;
    }
    const currentId = snapshot.location;
    if (currentId === nodeId) {
      return;
    }
    if (!Array.isArray(this.activeConnections) || !this.activeConnections.some((entry) => entry.node.id === nodeId)) {
      return;
    }
    const estimate = this.gameState.getTravelEstimate(currentId, nodeId);
    if (!estimate) {
      return;
    }
    if (this.previewCard?.dataset.mode === 'confirm' && this.pendingTravelNodeId === nodeId) {
      this._confirmTravel(nodeId);
      return;
    }
    this._showPreview(estimate, { mode: 'confirm' });
    if (this.previewConfirmButton) {
      this.previewConfirmButton.focus({ preventScroll: true });
    }
  }

  _handleKeydown(event) {
    if (event.key === 'Escape' && this.mobileDrawerOpen && this._isMobileView()) {
      this._closeMobileDrawer();
      event.preventDefault();
      return;
    }
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

  _handleAction(actionId) {
    const result = this.gameState.performNodeAction(actionId);
    if (result?.ok) {
      this._setActionFeedback(result.message || 'Action complete.');
      this._refresh();
    } else if (result?.reason) {
      this._setActionFeedback(result.reason);
    } else {
      this._setActionFeedback('That action is still under construction.');
    }
  }

  _setActionFeedback(text) {
    if (this.actionFeedback) {
      this.actionFeedback.textContent = text || '';
    }
  }

  _maybePreviewNode(nodeId) {
    const snapshot = this.currentSnapshot;
    if (this.suppressPeekTarget === nodeId) {
      this.suppressPeekTarget = null;
      return;
    }
    if (!snapshot || snapshot.location === nodeId) {
      this._hidePreview();
      return;
    }
    if (!Array.isArray(this.activeConnections) || !this.activeConnections.some((entry) => entry.node.id === nodeId)) {
      this._hidePreview();
      return;
    }
    const estimate = this.gameState.getTravelEstimate(snapshot.location, nodeId);
    if (!estimate) {
      this._hidePreview();
      return;
    }
    this._showPreview(estimate, { mode: 'peek' });
  }

  _showPreview(estimate, options = {}) {
    if (!this.previewCard) {
      return;
    }
    const mode = options.mode || 'peek';
    this.previewCard.dataset.visible = 'true';
    this.previewCard.dataset.mode = mode;
    this.activePreviewTarget = estimate.to.id;
    if (mode === 'confirm') {
      this.pendingTravelNodeId = estimate.to.id;
    } else {
      this.pendingTravelNodeId = null;
    }
    if (this.previewTitle) {
      this.previewTitle.textContent = estimate.to.name;
    }
    if (this.previewSubtitle) {
      const parts = [];
      if (estimate.to.kind) {
        parts.push(estimate.to.kind);
      }
      if (estimate.to.region) {
        parts.push(estimate.to.region);
      }
      this.previewSubtitle.textContent = parts.join(' • ');
      this.previewSubtitle.hidden = parts.length === 0;
    }
    if (this.previewStats) {
      this.previewStats.innerHTML = '';
      const efficiency = this.currentSnapshot?.vehicle?.efficiency ?? 1;
      const addStat = (label, value) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        this.previewStats.append(dt, dd);
      };
      addStat('Gas', `${estimate.gasCost} (distance ${estimate.distance.toFixed(1)} × eff ${efficiency.toFixed(2)} × rough ${estimate.roughness.toFixed(2)})`);
      if (estimate.skipHazard) {
        addStat('Ride risk', 'Protected');
      } else {
        addStat('Ride risk', `0–${estimate.rideRange.max}`);
      }
      if (estimate.previewTight || typeof estimate.knownHazard === 'number') {
        const hazardValue = typeof estimate.knownHazard === 'number' ? estimate.knownHazard : estimate.hazard;
        const percent = Math.round(Math.max(0, Math.min(1, hazardValue)) * 100);
        addStat('Hazard', `${percent}% chance of trouble`);
      }
      addStat('Snacks', `-${estimate.snackCost}`);
      addStat('Time', '+1 segment');
    }
    if (this.previewYields) {
      this.previewYields.innerHTML = '';
      if (Array.isArray(estimate.modifiers) && estimate.modifiers.length) {
        const modifierNote = document.createElement('p');
        modifierNote.className = 'map-preview-note';
        modifierNote.textContent = estimate.modifiers.join(' ');
        this.previewYields.append(modifierNote);
      }
      const known = Boolean(this.currentSnapshot?.knowledge?.[estimate.to.id]?.seen)
        || this.currentSnapshot?.visited?.includes(estimate.to.id);
      if (!known) {
        const unknown = document.createElement('p');
        unknown.textContent = 'Resources unknown until you visit.';
        this.previewYields.append(unknown);
      } else {
        const actions = this.gameState.getActionOptions(estimate.to.id);
        if (!actions.length) {
          const none = document.createElement('p');
          none.textContent = 'No actions logged for this stop yet.';
          this.previewYields.append(none);
        } else {
          actions.forEach((action) => {
            if (!action.preview || !action.definition) {
              return;
            }
            const row = document.createElement('p');
            const label = document.createElement('strong');
            label.textContent = `${action.definition.title}: `;
            row.append(label);
            const parts = [];
            if (Array.isArray(action.preview.yields)) {
              action.preview.yields.forEach((yieldEntry) => {
                parts.push(formatRange(yieldEntry, yieldEntry.resource));
              });
            }
            if (Array.isArray(action.preview.costs)) {
              action.preview.costs.forEach((cost) => {
                const amount = typeof cost.amount === 'number' ? cost.amount : cost.min ?? 0;
                if (amount) {
                  parts.push(`${cost.resource} -${amount}`);
                }
              });
            }
            if (Array.isArray(action.preview.mishaps) && action.preview.mishaps.length) {
              action.preview.mishaps.forEach((mishap) => {
                parts.push(`${mishap.resource} ${mishap.min ?? 0}–${mishap.max ?? 0}`);
              });
            }
            row.append(document.createTextNode(parts.filter(Boolean).join(' • ')));
            this.previewYields.append(row);
          });
        }
      }
    }
    if (this.previewConfirmButton) {
      const label = `Travel to ${estimate.to.name}`;
      this.previewConfirmButton.textContent = `${label}`;
      this.previewConfirmButton.setAttribute('aria-label', `${label} for ${estimate.gasCost} gas`);
      this.previewConfirmButton.disabled = mode !== 'confirm';
    }
    if (this.previewDismissButton) {
      this.previewDismissButton.disabled = mode !== 'confirm';
    }
  }

  _hidePreview() {
    if (!this.previewCard) {
      return;
    }
    this.previewCard.dataset.visible = 'false';
    this.previewCard.dataset.mode = 'peek';
    this.activePreviewTarget = null;
    this.pendingTravelNodeId = null;
    this.suppressPeekTarget = null;
    if (this.previewConfirmButton) {
      this.previewConfirmButton.disabled = true;
    }
    if (this.previewDismissButton) {
      this.previewDismissButton.disabled = true;
    }
  }

  _handleNodePointerExit(nodeId) {
    if (this.previewCard?.dataset.mode === 'confirm') {
      return;
    }
    if (this.activePreviewTarget !== nodeId) {
      return;
    }
    this._hidePreview();
  }

  _dismissTravelPreview() {
    const targetId = this.pendingTravelNodeId;
    this._hidePreview();
    if (!targetId || !this.mapArea) {
      return;
    }
    this.suppressPeekTarget = targetId;
    const button = this.mapArea.querySelector(`.map-node[data-node-id="${targetId}"]`);
    if (button && typeof button.focus === 'function') {
      button.focus({ preventScroll: true });
    }
  }

  _confirmTravel(nodeId) {
    const snapshot = this.gameState.getSnapshot();
    if (!snapshot) {
      return;
    }
    const currentId = snapshot.location;
    if (currentId === nodeId) {
      return;
    }
    const connections = Array.isArray(this.activeConnections) && this.activeConnections.length
      ? this.activeConnections
      : getConnections(this.graph, currentId);
    const target = connections.find((entry) => entry.node.id === nodeId);
    if (!target) {
      return;
    }

    const originNode = this.graph?.nodes?.get(currentId) || { id: currentId };
    const travelContext = this._createTravelContext(target.node, target.link, originNode);

    const result = this.gameState.travelTo(nodeId);

    this._hidePreview();
    this._refresh();

    const arrivalContext = {
      nodeId,
      node: target.node,
      region: target.node?.region || null
    };

    this._handleTravelEncounter(travelContext, () => {
      this._handleArrivalEncounter(arrivalContext);
    });
  }

  _createTravelContext(destinationNode, connection, originNode = null) {
    let fromNode = originNode || null;
    if (!fromNode) {
      const fromId = this.currentSnapshot?.location;
      fromNode = fromId ? this.graph?.nodes?.get(fromId) || { id: fromId } : null;
    }
    const hazard = typeof connection?.hazard === 'number' ? connection.hazard : 0;
    const tags = [];
    if (connection?.rough) {
      tags.push('rough');
    }
    if (hazard >= 0.6) {
      tags.push('hazard-high');
    } else if (hazard >= 0.3) {
      tags.push('hazard-medium');
    } else {
      tags.push('hazard-low');
    }
    if (typeof connection?.distance === 'number' && connection.distance > 1.6) {
      tags.push('long');
    }
    return {
      fromNodeId: fromNode?.id || null,
      toNodeId: destinationNode?.id || null,
      fromNode,
      toNode: destinationNode || null,
      connection,
      region: destinationNode?.region || null,
      tags
    };
  }

  _handleTravelEncounter(context, done) {
    const encounter = this.eventEngine.maybeTrigger('travel', this.gameState, context);
    if (!encounter) {
      done();
      return;
    }
    encounter.context = context;
    this.activeTravelEncounter = encounter;
    if (!this.travelBanner) {
      this.travelBanner = new TravelBanner(this.travelBannerContainer);
    }
    this.travelBanner.open(encounter, {
      onChoice: (stage, choice) => this._resolveTravelChoice(encounter, stage, choice, context),
      onComplete: () => {
        this.travelBanner.close();
        this.activeTravelEncounter = null;
        done();
      }
    });
  }

  _resolveTravelChoice(encounter, stage, choice, context) {
    try {
      const result = this.eventEngine.resolveChoice(encounter.id, stage.id, choice.id, this.gameState, context);
      const outcomeText = result.outcome || 'The road kept humming.';
      const finalStage = !result.nextStage;
      if (result.nextStage) {
        encounter.stage = result.nextStage;
        this.travelBanner.setStage(result.nextStage);
        this.travelBanner.showOutcome(outcomeText, { final: false });
      } else {
        this.travelBanner.showOutcome(outcomeText, { final: true });
      }
      this._refresh();
    } catch (error) {
      console.error('Failed to resolve travel encounter choice', error);
      this.travelBanner.showOutcome('The moment slipped by.', { final: true });
    }
  }

  _handleArrivalEncounter(context) {
    const encounter = this.eventEngine.maybeTrigger('arrival', this.gameState, context);
    if (!encounter) {
      return;
    }
    encounter.context = context;
    this.activeArrivalEncounter = encounter;
    this.eventModal.open(encounter, {
      onChoice: (stage, choice) => this._resolveArrivalChoice(encounter, stage, choice, context),
      onClose: () => {
        this.activeArrivalEncounter = null;
        this._refresh();
      }
    });
  }

  _resolveArrivalChoice(encounter, stage, choice, context) {
    try {
      const result = this.eventEngine.resolveChoice(encounter.id, stage.id, choice.id, this.gameState, context);
      const finalStage = !result.nextStage;
      const outcomeText = result.outcome || 'The scene settled.';
      if (result.nextStage) {
        encounter.stage = result.nextStage;
        this.eventModal.setStage(result.nextStage);
        this.eventModal.showOutcome(outcomeText, { lock: false });
      } else {
        this.eventModal.showOutcome(outcomeText, { lock: true });
      }
      this._refresh();
    } catch (error) {
      console.error('Failed to resolve arrival encounter choice', error);
      this.eventModal.showOutcome('That choice fizzled out.', { lock: true });
    }
  }
}
