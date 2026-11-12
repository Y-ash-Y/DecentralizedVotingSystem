import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require = createRequire(import.meta.url);

const modules = [
  ['ESM root', (await import('zod')).z],
  ['ESM v3', (await import('zod/v3')).z],
  ['CJS root', require('zod').z],
  ['CJS v3', require('zod/v3').z],
];
for (const [name, z] of modules) {
  test(`${name}: rejects oversized arrays before any element`, () => {
    let parsed = 0, refined = 0;
    const schema = z.array(z.preprocess(x => {parsed++; return x;}, z.string())).max(2, 'Limit')
      .refine(() => {refined++; return true;});
    const result = schema.safeParse(Array(5000).fill(0));
    assert.equal(result.success, false);
    assert.equal(parsed, 0); assert.equal(refined, 0);
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, 'too_big');
    assert.equal(result.error.issues[0].message, 'Limit');
  });
  test(`${name}: exact length rejects upper overflow, not lower-bound diagnostics`, () => {
    let calls = 0;
    const schema = z.array(z.preprocess(x => {calls++; return x;}, z.string())).length(2);
    const large = schema.safeParse([1, 2, 3]);
    assert.equal(calls, 0); assert.equal(large.error.issues.length, 1);
    assert.equal(large.error.issues[0].exact, true);
    const short = schema.safeParse([1]);
    assert.equal(calls, 1);
    assert.deepEqual(short.error.issues.map(i => i.code), ['too_small', 'invalid_type']);
  });
  test(`${name}: bounded sets reject before preprocessing`, () => {
    for (const build of [s => s.max(2), s => s.size(2)]) {
      let calls = 0;
      const schema = build(z.set(z.preprocess(x => {calls++; return x;}, z.string())));
      const result = schema.safeParse(new Set([1, 2, 3]));
      assert.equal(calls, 0); assert.equal(result.error.issues.length, 1);
      assert.equal(result.error.issues[0].code, 'too_big');
    }
  });
  test(`${name}: async array and set overflow creates no element tasks`, async () => {
    for (const kind of ['array', 'set', 'exact']) {
      let calls = 0;
      const child = z.string().refine(async () => {calls++; return true;});
      const schema = kind === 'set' ? z.set(child).max(1) :
        kind === 'exact' ? z.array(child).length(1) : z.array(child).max(1);
      const result = await schema.safeParseAsync(kind === 'set' ? new Set(['a', 'b']) : ['a', 'b']);
      assert.equal(calls, 0); assert.equal(result.error.issues.length, 1);
      assert.equal(result.error.issues[0].code, 'too_big');
    }
  });
  test(`${name}: boundary and async success preserve element transforms`, async () => {
    const child = z.string().transform(x => x.toUpperCase());
    assert.deepEqual(z.array(child).max(2).parse(['a', 'b']), ['A', 'B']);
    assert.deepEqual([...z.set(child).size(2).parse(new Set(['a', 'b']))], ['A', 'B']);
    const asyncChild = z.string().transform(async x => x.toUpperCase());
    assert.deepEqual(await z.array(asyncChild).length(2).parseAsync(['a', 'b']), ['A', 'B']);
    assert.deepEqual([...await z.set(asyncChild).max(2).parseAsync(new Set(['a', 'b']))], ['A', 'B']);
  });
  test(`${name}: invalid items inside the bound retain paths and diagnostics`, () => {
    const result = z.object({items: z.array(z.string()).max(2)}).safeParse({items: [1, 2]});
    assert.equal(result.success, false);
    assert.deepEqual(result.error.issues.map(i => i.path), [['items', 0], ['items', 1]]);
    const large = z.object({items: z.array(z.string()).max(0)}).safeParse({items: [1]});
    assert.deepEqual(large.error.issues.map(i => i.path), [['items']]);
  });
  test(`${name}: minimum bounds, type validation and empty values still work`, () => {
    assert.equal(z.array(z.string()).min(1).safeParse([]).error.issues[0].code, 'too_small');
    assert.equal(z.set(z.string()).min(1).safeParse(new Set()).error.issues[0].code, 'too_small');
    assert.equal(z.array(z.string()).max(1).safeParse(null).error.issues[0].code, 'invalid_type');
    assert.equal(z.set(z.string()).max(1).safeParse([]).error.issues[0].code, 'invalid_type');
    assert.deepEqual(z.array(z.string()).max(0).parse([]), []);
    assert.equal(z.set(z.string()).max(0).parse(new Set()).size, 0);
  });
  test(`${name}: unbounded containers remain explicitly outside mitigation`, () => {
    assert.equal(z.array(z.string()).safeParse([1, 2, 3]).error.issues.length, 3);
    assert.equal(z.set(z.string()).safeParse(new Set([1, 2, 3])).error.issues.length, 3);
    assert.equal(z.map(z.string(), z.string()).safeParse(new Map([[1, 2], [3, 4]])).error.issues.length, 4);
  });
}

test('million-item array and 100k-item set reject under a 64 MiB child heap', () => {
  const code = `
    const z=require('zod').z;
    const a=z.array(z.string()).max(100).safeParse(Array(1000000).fill(0));
    if(a.success || a.error.issues.length!==1)process.exit(1);
    const s=z.set(z.string()).max(100).safeParse(new Set(Array.from({length:100000},(_,i)=>i)));
    if(s.success || s.error.issues.length!==1)process.exit(2);
  `;
  const result = spawnSync(process.execPath, ['--max-old-space-size=64', '-e', code],
    {cwd: new URL('../', import.meta.url), timeout: 10000, maxBuffer: 65536, encoding: 'utf8'});
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  assert.equal(result.status, 0, 'Bounded collection stress check failed');
});
