# Pinned dependency mitigation

`zod-3.25.76.json` and [the installer](../scripts/patch-zod.cjs) backport early
upper-bound rejection to **Zod v3 arrays and sets**. This is project-maintained,
not an upstream release, independently audited fix or advisory exemption.
The original Zod MIT license stays in the installed package; no version or
package identity is changed.

## Apply and verify

From the contract package:

```sh
npm ci --ignore-scripts
npm run deps:patch
npm run deps:check
npm run test:tooling
npm test
```

`npm ci` reinstalls pristine packages; repeat the patch afterward. Contract
`npm test` also applies it idempotently and runs tooling tests in `pretest`.
CI applies the same explicit command after locked installation, while third-party
installation scripts remain disabled. The existing low-severity audit threshold
is unchanged and still blocks publication.

The installer verifies name/version and full-file before/after SHA-256 for the
ESM, CommonJS and TypeScript v3 implementation. Unknown bytes/version and linked
target paths are rejected before any write; already-patched files are accepted.
Files are replaced individually with same-directory atomic renames. A partial
I/O failure is not reported as success; rerun to finish or reinstall cleanly.
No global install or executable third-party install hook is used.

## Behavior and limits

- `.array(...).max(n)` and the upper side of `.length(n)` abort before the
  element walk. `.set(...).max(n)` and `.size(n)` do the same.
- Oversized input produces the size issue without per-element errors or later
  refinements; valid input, transforms and lower-bound diagnostics remain tested.
- This covers both sync and async parsing and root/`zod/v3` imports/requires.
- **Unbounded arrays/sets/maps, oversized individual elements, custom expensive
  refinements and v4 compatibility exports are not addressed.** It is not a
  general CPU/memory budget. Apply application input-size limits where needed.
- npm still reports the original Zod advisory: the version remains 3.25.76.
  Passing these regressions does not make the audit clean or authorize a push.

The approach follows the behavior of the
[upstream bounded-collection fix](https://github.com/colinhacks/zod/pull/6652)
and the [v3 tracking issue](https://github.com/colinhacks/zod/issues/6653),
but is implemented and tested locally. Simply installing Zod 4 while importing
its unchanged v3 compatibility code would not resolve this behavior.

## Evidence

Before patching, the four root/v3 ESM/CJS array regressions each parsed all 5,000
items despite an upper limit of two. After patching, all 39 tooling checks pass.
They include installer integrity/idempotence/symlink tests and rejection of a
million-item array plus a 100,000-item set in a child with a 64 MiB JavaScript heap.
That heap test excludes native process memory and measures only these fixtures.

Remove this patch only after a compatible upstream fix passes the same
regressions. Do not rename packages/versions, replace lockfile integrity fields,
omit development dependencies from audit, or suppress the advisory to get green.
