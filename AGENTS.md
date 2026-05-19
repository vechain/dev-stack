# @vechain/dev-stack — agent guide

Read this first. The user-facing `README.md` has install/usage docs; this file is the orientation an agent needs before changing anything here.

This file follows the [AGENTS.md](https://agents.md/) convention for this repository only — any coding agent (Claude Code, Codex, Cursor, Aider, etc.) working in this source repo should read it on session start. It is not published with the npm package, so downstream consumer repos installed from npm will not have this file.

## What this package is

A small Node.js (ESM, Node ≥20) package that brings up a **shared** local VeChain dev environment via Docker Compose and lets multiple sibling projects plug into it.

Shared infra (one set per machine, kept up across project switches):

- `thor-solo` — VeChain node in solo mode (port 8669)
- `mongo-node1` — single-node Mongo replica set (port 27017)
- `vechain-indexer` + `vechain-indexer-api` — chain indexer + REST API (api on 8089)
- `block-explorer` — VeChain block explorer UI (port 8088)
- Docker network: `vechain-thor` (external)

Per-project state:

- `vechain-dev.config.mjs` at the consumer project's root (declares `project`, `profiles`, `deploy`, `dev`, optional `overlay`)
- After deploy, the consumer calls `registerAddresses(...)` which writes `~/.vechain-dev/config/<project>.json`
- The CLI merges all registered projects' addresses + profiles and writes env files into `~/.vechain-dev/generated/` which the indexer and explorer containers env-file-mount

The point: each consumer deploys its own contracts to thor-solo and registers their addresses; the indexer/explorer see the **union** of every project's addresses + Spring profiles.

## Repository layout

```
bin/vechain-dev.mjs        CLI entrypoint (the `vechain-dev` bin)
lib/register.mjs           Public API — registerAddresses() (the package main)
lib/register.d.ts          Types for the public API
lib/addressBook.mjs        Reads ~/.vechain-dev/config/*.json, writes generated/*.env
lib/config.mjs             Loads vechain-dev.config.mjs from the consumer's cwd
lib/docker.mjs             docker compose / network wrappers
lib/thor.mjs               waitForThor, hasCode helpers
lib/paths.mjs              All filesystem path resolution (single source of truth)
lib/log.mjs                step/info/detail/warn/error log helpers
compose/                   base.yaml, indexer.yaml, explorer.yaml (Compose files)
genesis/solo.default.json  Default genesis used by thor-solo + indexer
```

## Public surface (don't break without thought)

Two things consumers depend on. Any change here is a breaking change for every downstream project.

1. **`registerAddresses({ project, profiles, addresses })`** — exported from package main. Signature defined in `lib/register.d.ts`. Validates and atomically writes `~/.vechain-dev/config/<project>.json`.
2. **`vechain-dev` CLI** — commands `up`, `down`, `reset`, `sync`, `status`. The `up` flow is load-config → ensure network → start thor+mongo → run consumer `deploy` → merge address book → recreate indexer+explorer → exec consumer `dev` (the dev process becomes the foreground; signals are forwarded).

## Conventions to respect

- **ESM only.** `"type": "module"`. Use `.mjs` for scripts, `import`/`export`, top-level `await` is fine.
- **No build step.** Source files ship as-is. Don't introduce TypeScript compilation, bundlers, or transpilers without strong reason.
- **No new runtime deps unless necessary.** The package currently has zero runtime dependencies — it's just Node stdlib + `docker` CLI. Keep it that way if you can.
- **All paths go through `lib/paths.mjs`.** Don't hardcode `~/.vechain-dev/...` elsewhere. If a new path is needed, add a helper there.
- **Compose invocations go through `lib/docker.mjs`.** Don't `spawn('docker', ...)` directly in the CLI; reuse `composeUp` / `composeDown` / `composeRecreate` / `waitHealthy`.
- **Address book is the only contract for inter-project state.** The shape of `~/.vechain-dev/config/<project>.json` (`{ project, profiles, addresses, updatedAt }`) is load-bearing — changing it changes the contract every consumer has already written against.
- **Spring profile names live in consumer projects.** When adding a new profile-keyed start-block env var to the indexer, append it to `SOLO_START_BLOCKS` in `lib/addressBook.mjs` so its cursor defaults to `0` for solo.
- **Container/service names are stable identifiers** (`thor-solo`, `mongo-node1`, `vechain-indexer`, `vechain-indexer-api`, `block-explorer`). The CLI references them by name; don't rename without updating every callsite.
- **Images are pinned via env var with a default tag** in each compose file (e.g. `${VECHAIN_DEV_INDEXER_IMAGE:-ghcr.io/vechain/vechain-indexer/indexer:6.28}`). Bump the default tag when intentionally upgrading.

## Testing

- `npm test` runs `node --test` (Node's built-in test runner). There are no test files yet — if you add features, add tests next to the module under `lib/<name>.test.mjs` and they'll be picked up automatically.
- Manual end-to-end check: in a consumer project with a `vechain-dev.config.mjs`, run `vechain-dev up` and confirm thor-solo (8669), indexer-api (8089), and block-explorer (8088) respond. `vechain-dev status` summarises this.

## Things that commonly surprise

- `vechain-dev down` stops the whole stack (shared + overlay). The thor-data volume is preserved — chain state, deployed contracts, and any test fixtures survive. Mongo has no named volume, so its data dies with the container and the indexer reindexes from scratch on next `up`. Use `vechain-dev reset` only when you want to wipe thor too.
- `up` always **force-recreates** indexer + indexer-api + block-explorer so they re-read the freshly merged env files. Don't optimise that away — it's how new addresses become visible without a manual restart.
- If the consumer's deploy script forgets to call `registerAddresses`, `up` warns but proceeds. The merged env files will just be missing that project's addresses.
- The indexer container gets `SPRING_PROFILES_ACTIVE=indexer,<union of project profiles>`. The indexer-api gets the same union **without** the `indexer` profile. This split is intentional.

## When working on this package

- For UX changes to the CLI, run it against a real consumer project — type checking won't catch a broken Compose call.
- Keep `README.md` (user-facing) and this `AGENTS.md` (agent-facing) in sync when behavior changes.
- Don't add documentation files beyond these two unless asked.
