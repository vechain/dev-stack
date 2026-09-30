import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from './addressBook.mjs'

test('merges profiles and addresses across projects', () => {
  const { indexerEnv, indexerApiEnv, explorerEnv, renamed } = build([
    { project: 'a', profiles: ['nfts', 'b3tr'], addresses: { A_ADDRESS: '0x1' } },
    { project: 'b', profiles: ['b3tr', 'accounts'], addresses: { B_ADDRESS: '0x2' } },
  ])
  assert.equal(indexerEnv.SPRING_PROFILES_ACTIVE, 'indexer,accounts,b3tr,nfts')
  assert.equal(indexerApiEnv.SPRING_PROFILES_ACTIVE, 'accounts,b3tr,nfts')
  assert.deepEqual(explorerEnv, { A_ADDRESS: '0x1', B_ADDRESS: '0x2' })
  assert.equal(indexerEnv.A_ADDRESS, '0x1')
  assert.deepEqual(renamed, [])
})

test('pins every solo start block to genesis', () => {
  const { indexerEnv } = build([])
  assert.equal(indexerEnv.INDEXER_START_BLOCK_BLOCKS, '0')
  assert.equal(indexerEnv.INDEXER_START_BLOCK_VEVOTE_HISTORIC, '0')
  assert.equal(indexerEnv.INDEXER_START_BLOCK_HISTORIC_PROPOSALS, undefined)
})

test('translates renamed indexer profiles and reports them', () => {
  const { indexerApiEnv, renamed } = build([
    { project: 'stargate', profiles: ['transactions', 'validator', 'validator-reward'], addresses: {} },
  ])
  assert.equal(indexerApiEnv.SPRING_PROFILES_ACTIVE, 'blocks,validator')
  assert.deepEqual(renamed, [
    { project: 'stargate', from: 'transactions', to: 'blocks' },
    { project: 'stargate', from: 'validator-reward', to: 'validator' },
  ])
})
