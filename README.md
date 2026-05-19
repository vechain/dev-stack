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

## Three commands

```bash
vechain-dev up      # ensure shared infra, run deploy, sync, restart indexer/explorer, exec dev
vechain-dev down    # stop the stack (thor state preserved; mongo is ephemeral)
vechain-dev reset   # nuke all shared infra, volumes, and ~/.vechain-dev/
```

Project package.json:

```json
"scripts": {
  "dev":       "vechain-dev up",
  "dev:down":  "vechain-dev down",
  "dev:reset": "vechain-dev reset"
}
```

## Endpoints

| service        | URL                       |
|----------------|---------------------------|
| thor-solo      | http://localhost:8669     |
| indexer-api    | http://localhost:8089     |
| block-explorer | http://localhost:8088     |
| mongo          | mongodb://localhost:27017 |
