import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveVaultItem } from './vault-path.mjs';

test('explorer actions resolve only supported real items within the current vault', async t => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slate-explorer-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'Notes'));await fs.writeFile(path.join(root,'Notes','A.md'),'A');
 assert.equal(await resolveVaultItem(root,'Notes/A.md','note'),path.join(root,'Notes','A.md'));
 assert.equal(await resolveVaultItem(root,'Notes','folder'),path.join(root,'Notes'));
 assert.equal(await resolveVaultItem(root,'','folder'),await fs.realpath(root));
 for(const name of ['../escape.md','C:/escape.md','Notes/A.md:secret','Notes/.private.md','Notes/CON.md'])await assert.rejects(resolveVaultItem(root,name,'note'));
 await assert.rejects(resolveVaultItem(root,'Notes/A.md','executable'));
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'slate-outside-'));
 t.after(()=>fs.rm(outside,{recursive:true,force:true}));
 await fs.symlink(outside,path.join(root,'Linked'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(resolveVaultItem(root,'Linked','folder'),/junction|Symbolic/);
});
