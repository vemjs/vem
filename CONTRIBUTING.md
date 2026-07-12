# Contributing to Vem

Thanks for looking at Vem's source. This repo holds the editor monorepo — `@vemjs/core`,
`renderer-vecto`, `lsp-client`, and `plugin-api`. Official plugins live in
[vem-plugins](https://github.com/vemjs/vem-plugins), the web build in
[vem-website](https://github.com/vemjs/vem-website), and the desktop shell in
[vem-desktop](https://github.com/vemjs/vem-desktop).

## Process

Every change goes through `Issue → Branch → PR → Review → Merge`:

1. Open an issue describing the bug or feature, unless one already covers it.
2. Branch from `main`.
3. Make the change with tests — this project follows TDD: a failing test first, then the fix.
4. Open a PR against `main`. CI (typecheck, build, test, lint, format) must pass.
5. A maintainer reviews and merges. `main` is deploy/publish-ready at all times.

## Local development

```bash
git clone https://github.com/vemjs/vem.git
cd vem
bun install
bun run build
bun test
```

Before opening a PR, run the full local gate:

```bash
bun test
bun run lint
bun run format
```

## Versioning and releases

Packages are versioned with [Changesets](https://github.com/changesets/changesets). If your PR
changes published package behavior, add a changeset:

```bash
bun run changeset
```

Pick `patch` for bug fixes, `minor` for backward-compatible new features, `major` for breaking
changes. Merging to `main` with pending changesets opens (or updates) a "Version Packages" PR;
merging that PR publishes the bumped packages to npm automatically.

## Code style

- TypeScript, formatted with Prettier and linted with Oxlint (both run in CI).
- Comments explain the _why_ — a non-obvious constraint, invariant, or workaround — not what the
  code already says.
- No `// TODO`s or half-finished implementations in merged code.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include the Vem
version/commit, the platform (browser vs desktop), and the exact key sequence or steps to
reproduce — most reports here turn out to be one specific motion or command misbehaving, so being
precise saves a lot of back-and-forth.

## Security

Please don't file public issues for security vulnerabilities — see [SECURITY.md](SECURITY.md).
