export async function loadJSON(path) {
  const url = new URL(path, import.meta.url);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load JSON at ${path}: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    if (url.protocol === 'file:' && typeof process !== 'undefined') {
      const { readFile } = await import('node:fs/promises');
      const data = await readFile(url, 'utf-8');
      return JSON.parse(data);
    }
    throw error;
  }
}
