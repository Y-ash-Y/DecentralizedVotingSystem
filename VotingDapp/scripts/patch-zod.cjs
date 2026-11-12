// Explicit, hash-checked local mitigation. Does not alter versions or npm audit.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const manifest = require('../patches/zod-3.25.76.json');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function regularPath(root, relative, directory = false) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
    throw new Error('Unsafe patch path');
  }
  const parts = relative.split('/');
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() ||
        ((index < parts.length - 1 || directory) ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error(`Refusing non-regular patch path: ${relative}`);
    }
  }
  return current;
}

function applyZodPatch(root, mode = 'check') {
  if (!['apply', 'check'].includes(mode)) throw new Error('Use apply or check mode');
  if (fs.lstatSync(root).isSymbolicLink() || !fs.statSync(root).isDirectory()) {
    throw new Error('Refusing a linked or non-directory Zod installation');
  }
  const pkg = JSON.parse(fs.readFileSync(regularPath(root, 'package.json'), 'utf8'));
  if (pkg.name !== manifest.package || pkg.version !== manifest.version) {
    throw new Error('Unexpected Zod package/version; review the patch before proceeding');
  }
  // Prepare every output before touching any file. Unknown bytes fail closed.
  const plan = manifest.files.map(entry => {
    const filename = regularPath(root, entry.path);
    const bytes = fs.readFileSync(filename);
    const hash = digest(bytes);
    if (hash === entry.afterSha256) return {entry, filename, changed: false};
    if (hash !== entry.beforeSha256) throw new Error(`Unexpected Zod file hash: ${entry.path}`);
    if (mode === 'check') throw new Error('Zod mitigation missing; run npm run deps:patch');
    let text = bytes.toString('utf8');
    for (const replacement of entry.replacements) {
      if (text.split(replacement.before).length !== 2) throw new Error('Ambiguous patch context');
      text = text.replace(replacement.before, replacement.after);
    }
    if (digest(text) !== entry.afterSha256) throw new Error('Patched output hash mismatch');
    return {entry, filename, text, changed: true};
  });
  for (const item of plan.filter(item => item.changed)) {
    const temporary = `${item.filename}.votechain-${crypto.randomBytes(8).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(temporary, item.text, {flag: 'wx', mode: fs.statSync(item.filename).mode & 0o777});
      fs.renameSync(temporary, item.filename);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  return {package: pkg.name, version: pkg.version, files: plan.length,
    changed: plan.filter(item => item.changed).length,
    scope: manifest.scope, auditExemption: false};
}

module.exports = {applyZodPatch};
if (require.main === module) {
  try {
    const arg = process.argv.slice(2);
    if (arg.length !== 1 || !['--apply', '--check'].includes(arg[0])) {
      throw new Error('Usage: node scripts/patch-zod.cjs --apply|--check');
    }
    // Resolve only this project's ordinary npm installation, never a global package.
    const nodeModules = path.resolve(__dirname, '../node_modules');
    if (fs.lstatSync(nodeModules).isSymbolicLink()) throw new Error('Refusing linked node_modules');
    console.log(JSON.stringify(applyZodPatch(path.join(nodeModules, 'zod'), arg[0].slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
