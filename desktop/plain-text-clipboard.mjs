const limit = 4 * 1024 * 1024;
function validate(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > limit) throw new Error('Clipboard text exceeds the 4 MiB limit or is not plain text.');
  return text;
}
export async function readClipboardText(clipboard) { return validate(await clipboard.readText()); }
export async function writeClipboardText(clipboard, text) { await clipboard.writeText(validate(text)); }
