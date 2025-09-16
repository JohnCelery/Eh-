import { loadJSON } from './jsonLoader.js';

const placeholderCache = new Map();

function createPlaceholder(label) {
  if (placeholderCache.has(label)) {
    return placeholderCache.get(label);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');

  const size = 20;
  for (let y = 0; y < canvas.height; y += size) {
    for (let x = 0; x < canvas.width; x += size) {
      const isDark = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = isDark ? '#0b6dca' : '#ef6c33';
      ctx.fillRect(x, y, size, size);
    }
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(0, canvas.height - 48, canvas.width, 48);
  ctx.fillStyle = '#082032';
  ctx.font = '700 20px "Inter", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), canvas.width / 2, canvas.height - 24);

  const dataUrl = canvas.toDataURL('image/png');
  placeholderCache.set(label, dataUrl);
  return dataUrl;
}

async function resolveImage(entry) {
  const label = entry.label || entry.key;
  const url = new URL(entry.path, import.meta.url);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Missing asset: ${entry.path}`);
    }
    return url.href;
  } catch (error) {
    console.warn('Generating placeholder for missing asset', label, error);
    return createPlaceholder(label);
  }
}

class AssetManager {
  constructor() {
    this.assets = new Map();
    this._loading = null;
  }

  async load() {
    if (!this._loading) {
      this._loading = this._loadManifest();
    }
    return this._loading;
  }

  async _loadManifest() {
    const manifest = await loadJSON('../data/manifest.json');
    const groups = Array.isArray(manifest.images) ? manifest.images : [];
    const entries = await Promise.all(
      groups.map(async (entry) => {
        const src = await resolveImage(entry);
        return { ...entry, src };
      })
    );
    entries.forEach((entry) => {
      this.assets.set(entry.key, entry);
    });
    return this.assets;
  }

  get(key) {
    return this.assets.get(key);
  }
}

export const assets = new AssetManager();
