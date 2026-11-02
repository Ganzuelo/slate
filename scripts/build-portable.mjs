import { build, Platform, Arch } from 'electron-builder';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-package-'));
try {
  // Explicit runtime allowlist: never distribute local vaults, tests, private
  // workspace files, or the development dependency tree.
  for (const name of ['public', 'desktop', 'sample-vault']) {
    await fs.cp(path.join(root, name), path.join(stage, name), {
      recursive: true,
      filter: source => !source.endsWith('.test.mjs') && !path.basename(source).startsWith('.'),
    });
  }
  for (const name of ['server.mjs', 'core.mjs', 'icon-store.mjs', 'whiteboard.mjs', 'note-merge.mjs', 'LICENSE']) {
    await fs.copyFile(path.join(root, name), path.join(stage, name));
  }
  await fs.cp(path.join(root, 'scripts', 'licenses'), path.join(stage, 'licenses'), { recursive: true });
  const dependency = 'diff-match-patch';
  await fs.cp(path.join(root, 'node_modules', dependency), path.join(stage, 'node_modules', dependency), { recursive: true });
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({
    name: metadata.name, version: metadata.version, description: metadata.description,
    type: 'module', main: metadata.main, license: metadata.license,
    author: 'Slate contributors', dependencies: { [dependency]: metadata.dependencies[dependency] },
  }, null, 2));
  const artifacts = await build({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64),
    publish: 'never',
    config: {
      appId: 'com.ganzuelo.slate', productName: 'Slate',
      electronVersion: metadata.devDependencies.electron,
      directories: { app: stage, output: path.join(root, 'dist') },
      // The child vault server runs with Electron's built-in Node runtime.
      // Keep its scripts and dependencies accessible to that process.
      asar: false, npmRebuild: false,
      win: { icon: path.join(root, 'desktop', 'assets', 'slate.ico'), signAndEditExecutable: true },
      portable: { artifactName: 'Slate-${version}-portable-${arch}.${ext}', requestExecutionLevel: 'user' },
    },
  });
  for (const artifact of artifacts) {
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(await fs.readFile(artifact)).digest('hex');
    await fs.writeFile(artifact + '.sha256', `${hash}  ${path.basename(artifact)}\n`);
    console.log(`Portable build: ${artifact}\nSHA-256: ${hash}`);
  }
} finally {
  await fs.rm(stage, { recursive: true, force: true });
}
