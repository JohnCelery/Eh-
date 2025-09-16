export async function loadJSON(path) {
  const url = new URL(path, import.meta.url);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load JSON at ${path}: ${response.status}`);
  }
  return response.json();
}
