# @vechain/dev-stack

[![npm version](https://img.shields.io/npm/v/@vechain/dev-stack.svg)](https://www.npmjs.com/package/@vechain/dev-stack)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

Shared local development environment for VeChain projects.

Brings up one thor-solo node, one mongo, one vechain-indexer, and one block-explorer that multiple projects can share. Each project deploys its own contracts and registers their addresses with the shared stack; the indexer and explorer pick up the union.

## Consumer contract

A project joins the stack by providing two things:

### 1. `vechain-dev.config.mjs` at the project root

```js
export default {
  project: 'my-project',
  profiles: ['safe', 'accounts', 'transactions'],
  deploy:  'yarn contracts:deploy:solo',
  dev:     'yarn frontend:dev',
  // optional:
  // overlay: 'docker/overlay.yaml',
}
```

### 2. A deploy step that registers addresses

After deploying contracts to thor-solo, the deploy script calls:

```js
import { registerAddresses } from '@vechain/dev-stack'

await registerAddresses({
  project: 'my-project',
  profiles: ['safe', 'accounts', 'transactions'],
  addresses: {
    SAFE_EMITTER_CONTRACT:       '0x...',
    SAFE_PROXY_FACTORY_CONTRACT: '0x...',
  },
})
```

This writes `~/.vechain-dev/config/my-project.json`.

## Commands

Full orchestration (requires `vechain-dev.config.mjs`):

```bash
vechain-dev up                  # ensure infra, deploy if needed, sync, exec dev
vechain-dev up --redeploy       # force the deploy step even if contracts are on-chain
vechain-dev up --skip-deploy    # bring infra up without running the deploy step
vechain-dev deploy              # re-run deploy + recreate indexer (no thor/mongo/explorer restart)
vechain-dev deploy --redeploy   # same, ignoring the on-chain deployment check
```

Stack lifecycle (no config required):

```bash
vechain-dev down                # stop the full stack (thor state preserved)
vechain-dev reset               # nuke all shared infra, volumes, and ~/.vechain-dev/
vechain-dev sync                # re-merge address book and recreate indexer + explorer
vechain-dev status              # show registered projects and service health
```

Standalone thor-solo (no config required):

```bash
vechain-dev solo up             # start only thor-solo
vechain-dev solo down           # stop only thor-solo (chain state preserved)
vechain-dev solo logs [-f]      # tail thor-solo logs
```

Typical `package.json`:

```json
"scripts": {
  "dev":          "vechain-dev up",
  "dev:down":     "vechain-dev down",
  "dev:reset":    "vechain-dev reset",
  "dev:redeploy": "vechain-dev deploy --redeploy"
}
```

## Customizing thor-solo

All optional, all read from the environment:

| env var                                     | default                          | maps to                       |
|---------------------------------------------|----------------------------------|-------------------------------|
| `VECHAIN_DEV_THOR_IMAGE`                    | `ghcr.io/vechain/thor:latest`    | docker image                  |
| `VECHAIN_DEV_THOR_GAS_LIMIT`                | `40000000`                       | `--gas-limit`                 |
| `VECHAIN_DEV_THOR_TXPOOL_LIMIT`             | `10000`                          | `--txpool-limit`              |
| `VECHAIN_DEV_THOR_TXPOOL_LIMIT_PER_ACCOUNT` | `256`                            | `--txpool-limit-per-account`  |
| `VECHAIN_DEV_THOR_API_CORS`                 | `*`                              | `--api-cors`                  |
| `VECHAIN_DEV_GENESIS`                       | bundled `solo.default.json`      | mounted genesis file          |
| `VECHAIN_DEV_HOME`                          | `~/.vechain-dev`                 | state directory               |
| `VECHAIN_DEV_INDEXER_IMAGE`                 | `ghcr.io/vechain/vechain-indexer/indexer:6.31.5` | indexer image |
| `VECHAIN_DEV_INDEXER_API_IMAGE`             | `ghcr.io/vechain/vechain-indexer/api:6.31.5`     | indexer-api image |
| `VECHAIN_DEV_EXPLORER_IMAGE`                | `ghcr.io/vechain/block-explorer:2.41.0`           | block-explorer image |

These work for both `vechain-dev solo up` and `vechain-dev up`.

## Programmatic API

```ts
import { registerAddresses, isProjectDeployed } from '@vechain/dev-stack'
```

`isProjectDeployed(project, opts?)` returns `{ deployed: true }` or one of:

- `{ deployed: false, reason: 'not-registered' }` — no registration file yet
- `{ deployed: false, reason: 'missing-code', address }` — registered address has no code on-chain
- `{ deployed: false, reason: 'address-mismatch', name, expected, actual }` — only when `expectedAddresses` is supplied and a registered address differs

Pass `expectedAddresses: { ENV_NAME: '0x…' }` to detect stale registrations (e.g. cached deployment artifacts pointing at a different address than the chain). This replaces the per-project artifact-wipe scripts some consumers maintain.

## Endpoints

| service        | URL                       |
|----------------|---------------------------|
| thor-solo      | http://localhost:8669     |
| indexer-api    | http://localhost:8089     |
| block-explorer | http://localhost:8088     |
| mongo          | mongodb://localhost:27017 |
