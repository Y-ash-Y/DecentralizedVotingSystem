import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {applyZodPatch} = require('../scripts/patch-zod.cjs');
const manifest = require('../patches/zod-3.25.76.json');
const installed = path.dirname(require.resolve('zod/package.json'));

function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'votechain-zod-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true})); // Owned test fixture only.
  const root=path.join(directory,'zod'); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'zod',version:'3.25.76'}));
  for(const entry of manifest.files) {
    let content=fs.readFileSync(path.join(installed,entry.path),'utf8');
    // Fixtures start pristine regardless of whether this npm install is patched.
    for(const replacement of entry.replacements) content=content.replace(replacement.after,replacement.before);
    const filename=path.join(root,entry.path);
    fs.mkdirSync(path.dirname(filename),{recursive:true}); fs.writeFileSync(filename,content);
  }
  return root;
}
const contents=root=>manifest.files.map(entry=>fs.readFileSync(path.join(root,entry.path),'utf8'));

test('check mode fails without changing pristine files', t=>{
  const root=fixture(t), before=contents(root);
  assert.throws(()=>applyZodPatch(root,'check'),/mitigation missing/);
  assert.deepEqual(contents(root),before);
});
test('patch installs once, verifies and is idempotent', t=>{
  const root=fixture(t), pkg=fs.readFileSync(path.join(root,'package.json'),'utf8');
  assert.equal(applyZodPatch(root,'apply').changed,3);
  assert.equal(applyZodPatch(root,'apply').changed,0);
  assert.equal(applyZodPatch(root,'check').changed,0);
  assert.equal(fs.readFileSync(path.join(root,'package.json'),'utf8'),pkg);
});
test('unknown later-file bytes reject the entire plan before earlier files change', t=>{
  const root=fixture(t), last=path.join(root,manifest.files.at(-1).path);
  fs.appendFileSync(last,'\n// unexpected edit\n'); const before=contents(root);
  assert.throws(()=>applyZodPatch(root,'apply'),/Unexpected Zod file hash/);
  assert.deepEqual(contents(root),before);
});
test('unexpected version or package refuses mutation', t=>{
  for(const pkg of [{name:'zod',version:'4.6.7'},{name:'another-package',version:'3.25.76'}]) {
    const root=fixture(t); fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg));
    const before=contents(root);
    assert.throws(()=>applyZodPatch(root,'apply'),/Unexpected Zod package/);
    assert.deepEqual(contents(root),before);
  }
});
test('linked installation, target file and target directory are refused', t=>{
  for(const kind of ['root','file','directory']) {
    const root=fixture(t); let selected=root;
    if(kind==='root') {
      selected=root+'-link'; fs.symlinkSync(root,selected,'dir');
    } else {
      const item=path.join(root,kind==='file'?'v3/types.js':'v3');
      fs.renameSync(item,item+'-original'); fs.symlinkSync(item+'-original',item,kind==='file'?'file':'dir');
    }
    assert.throws(()=>applyZodPatch(selected,'apply'),/Refusing/);
  }
});
test('invalid mode is not treated as permission to apply', t=>{
  const root=fixture(t), before=contents(root);
  assert.throws(()=>applyZodPatch(root,'unexpected'),/Use apply or check/);
  assert.deepEqual(contents(root),before);
});
