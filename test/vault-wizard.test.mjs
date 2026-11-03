import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../public/app-menus.js', import.meta.url), 'utf8');
const wizard = source.slice(source.indexOf('function openVaultWizard()'), source.indexOf('function menuItem('));
function setup() {
 const elements = new Map(), calls = [], progress = [0, 1, 2].map(index => ({ dataset: { vaultStep: String(index) }, setAttribute() {}, removeAttribute() {} }));
 const get = id => {
  if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: false, attrs: {},
   setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; },
   focus() { this.focused = true; }, showModal() { this.open = true; }, close() { this.open = false; this.onclose?.(); }, querySelectorAll: () => progress,
  });
  return elements.get(id);
 };
 const desktop = { chooseVaultLocation: async () => ({ path: 'C:\\Notes', separator: '\\' }),
  saveWorkspace: async state => calls.push(['save', state]), createVault: async name => { calls.push(['create', name]); return { changed: true }; },
 };
 const context = vm.createContext({ $: get, desktop, clearTimeout, persistTimer: null, workspace: () => ({ notes: ['Keep.md'] }), afterSafe: action => action(), openVaultManager: async () => get('vaultManagerDialog').showModal() });
 vm.runInContext(wizard, context);
 const open = () => vm.runInContext('openVaultWizard()', context);
 const submit = () => get('vaultWizardForm').onsubmit({ preventDefault() {} });
 open();
 return { get, desktop, calls, open, submit, context };
}

test('vault wizard validates names and locations, preserves edits going back, and saves before creating', async () => {
 const { get, submit, calls } = setup();
 await submit();
 assert.equal(get('vaultWizardName').attrs['aria-invalid'], 'true');
 get('vaultWizardName').value = '../escape'; await submit();
 assert.equal(get('vaultWizardLocationStep').hidden, true);
 get('vaultWizardName').value = ' Personal notes '; await submit();
 assert.equal(get('vaultWizardLocationStep').hidden, false);
 await submit(); assert.match(get('vaultWizardError').textContent, /parent folder/);
 await get('vaultWizardBrowse').onclick(); await submit();
 assert.equal(get('vaultWizardReviewPath').textContent, 'C:\\Notes\\Personal notes');
 assert.equal(calls.length, 0);
 get('vaultWizardBack').onclick(); get('vaultWizardBack').onclick();
 assert.equal(get('vaultWizardName').value, 'Personal notes');
 get('vaultWizardName').value = 'Work'; await submit(); await submit();
 assert.equal(get('vaultWizardReviewPath').textContent, 'C:\\Notes\\Work');
 await submit();
 assert.equal(calls[0][0], 'save'); assert.equal(calls[1][0], 'create'); assert.equal(calls[1][1], 'Work');
});

test('picker cancellation creates nothing and creation errors leave a retryable wizard', async () => {
 const { get, desktop, submit, calls } = setup();
 get('vaultWizardName').value = 'Notes'; await submit();
 desktop.chooseVaultLocation = async () => null;
 await get('vaultWizardBrowse').onclick(); await submit();
 assert.equal(get('vaultWizardLocationStep').hidden, false); assert.equal(calls.length, 0);
 desktop.chooseVaultLocation = async () => ({ path: '/notes', separator: '/' });
 await get('vaultWizardBrowse').onclick(); await submit();
 desktop.createVault = async () => { throw new Error('That folder already exists.'); };
 await submit();
 assert.match(get('vaultWizardError').textContent, /already exists/);
 assert.equal(get('vaultWizardNext').disabled, false);
 get('vaultWizardCancel').onclick(); await Promise.resolve();
 assert.equal(get('vaultManagerDialog').open, true);
});

test('unsaved-change protection runs before opening the wizard', () => {
 const { context, get, open } = setup();
 get('vaultWizardDialog').close();
 context.afterSafe = action => { context.pendingAction = action; };
 open(); assert.equal(get('vaultWizardDialog').open, false);
 context.pendingAction(); assert.equal(get('vaultWizardDialog').open, true);
});
