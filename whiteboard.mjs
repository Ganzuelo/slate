// Validate the portable scene before it crosses the vault write boundary.
export function validateWhiteboard(content) {
  let value;
  try { value = JSON.parse(content); } catch { throw new Error('Whiteboard must contain valid JSON.'); }
  if (!value || value.type !== 'excalidraw' || value.version !== 2 || !Array.isArray(value.elements) || value.elements.length > 10000 || !value.appState || typeof value.appState !== 'object' || Array.isArray(value.appState) || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) throw new Error('Invalid Excalidraw scene.');
  // Embeds are stored for portability but never rendered (validateEmbeddable and CSP block frames).
  const types = new Set(['rectangle','diamond','ellipse','arrow','line','freedraw','text','image','frame','magicframe','embeddable']);
  const ids = new Set();
  for (const element of value.elements) {
    if (!element || typeof element.id !== 'string' || !element.id || ids.has(element.id) || !types.has(element.type) || !['x','y','width','height'].every(key => Number.isFinite(element[key])) || element.width < 0 || element.height < 0) throw new Error('Invalid or unsupported whiteboard element.');
    ids.add(element.id);
  }
  if (Object.keys(value.files).length > 1000) throw new Error('Too many whiteboard images.');
  for (const [id, file] of Object.entries(value.files)) {
    if (!file || file.id !== id || !['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'].includes(file.mimeType) || typeof file.dataURL !== 'string' || !file.dataURL.startsWith('data:' + file.mimeType + ';base64,') || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataURL.split(',')[1])) throw new Error('Whiteboard images must be embedded PNG, JPEG, GIF, WebP, or SVG data.');
  }
  return value;
}
