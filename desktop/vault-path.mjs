import { Vault } from '../core.mjs';

// The renderer can reveal supported items in its current vault, never arbitrary paths.
export async function resolveVaultItem(root, name, kind) {
  if (!['note', 'canvas', 'whiteboard', 'folder'].includes(kind)) throw new Error('Unsupported explorer item.');
  const vault = new Vault(root); await vault.init();
  if (name === '' && kind === 'folder') return vault.root;
  return vault.file(name, false, kind);
}
