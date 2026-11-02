import fs from 'node:fs/promises';
import path from 'node:path';

// Packaged resources can be read-only or extracted into a temporary directory.
// Seed the starter vault in persistent storage, and never overwrite user notes.
export async function defaultVault(appRoot, userData, packaged) {
  const example = path.join(appRoot, 'sample-vault');
  if (!packaged) return example;
  const vault = path.join(userData, 'Vault');
  await fs.mkdir(userData, { recursive: true });
  try { await fs.mkdir(vault); }
  catch (error) { if (error.code === 'EEXIST') return vault; throw error; }
  for (const name of await fs.readdir(example)) {
    await fs.cp(path.join(example, name), path.join(vault, name), { recursive: true, force: false, errorOnExist: true });
  }
  return vault;
}
