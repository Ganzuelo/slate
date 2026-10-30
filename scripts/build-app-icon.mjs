// Renders desktop/assets/slate.svg to PNG sizes and a Windows .ico.
// Run with Electron: npx electron scripts/build-app-icon.mjs
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'desktop', 'assets');
const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

async function render(svg, size) {
  const win = new BrowserWindow({ width: size, height: size, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`;
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await win.webContents.executeJavaScript('document.images[0].decode()');
  await new Promise(resolve => setTimeout(resolve, 150));
  let image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  win.destroy();
  if (image.getSize().width !== size) image = image.resize({ width: size, height: size, quality: 'best' });
  return image.toPNG();
}

function ico(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, i) => {
    const at = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map(entry => entry.png)]);
}

app.whenReady().then(async () => {
  const svg = await fs.readFile(path.join(assets, 'slate.svg'), 'utf8');
  const rendered = [];
  for (const size of pngSizes) {
    const png = await render(svg, size);
    rendered.push({ size, png });
    await fs.writeFile(path.join(assets, `slate-${size}.png`), png);
  }
  await fs.writeFile(path.join(assets, 'slate.png'), rendered.find(entry => entry.size === 512).png);
  await fs.writeFile(path.join(assets, 'slate.ico'), ico(rendered.filter(entry => icoSizes.includes(entry.size))));
  console.log('Wrote icons to', assets);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
