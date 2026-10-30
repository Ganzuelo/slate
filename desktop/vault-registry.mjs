import path from 'node:path';

const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);

export function knownVaults(settings = {}, current) {
  const unique = new Map();
  for (const folder of [current, settings.vault, ...(Array.isArray(settings.vaults) ? settings.vaults : [])]) {
    if (typeof folder !== 'string' || !path.isAbsolute(folder)) continue;
    const id = key(folder);
    if (!unique.has(id)) unique.set(id, { path: folder, name: path.basename(folder) || folder, current: !!current && id === key(current) });
  }
  return [...unique.values()];
}

export function rememberVault(settings, folder) {
  return { ...settings, vault: folder, vaults: knownVaults(settings, folder).map(vault => vault.path) };
}

export function findKnownVault(settings, current, folder) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('Choose a known vault or use the folder picker.');
  const vault = knownVaults(settings, current).find(vault => key(vault.path) === key(folder));
  if (!vault) throw new Error('This vault is no longer in the list. Use Open another folder to add it.');
  return vault;
}

export function forgetVault(settings, current, folder) {
  const vault = findKnownVault(settings, current, folder);
  if (vault.current) throw new Error('Switch to another vault before removing this one from the list.');
  return { ...settings, vault: current, vaults: knownVaults(settings, current).filter(item => key(item.path) !== key(vault.path)).map(item => item.path) };
}

// Keep the old server alive until navigation succeeds (including beforeunload).
export async function transitionVault(previous, folder, { start, navigate, remember, retire }) {
  if (key(previous.vault) === key(folder)) return previous;
  const next = await start(folder);
  try { await navigate(next.url); }
  catch (error) { await retire(next); throw error; }
  // Navigation has committed; the caller must track the new active server even if persisting fails.
  try { await remember(next); }
  finally { await retire(previous); }
  return next;
}
