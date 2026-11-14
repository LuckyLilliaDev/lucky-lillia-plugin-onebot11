import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NTQQ, ONEBOT, FFMPEG, instanceConfig, writeFixtures } from '../../scripts/e2e-fixtures.mjs'

describe('native E2E fixtures for external plugins', () => {
  it('enables and trusts both external packages with separate per-instance ports and accounts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'llbot-e2e-config-'))
    try {
      await writeFixtures(root, { primary: '12345', secondary: '67890', group: '555', token: 'fixture-token', ffmpeg: true })
      const json = async (file: string) => JSON.parse(await readFile(path.join(root, file), 'utf8'))
      for (let index = 0; index < 2; index++) {
        const config = await json(`workspace${index + 1}/data/instances/default/plugins.json`)
        expect(config.trusted).toEqual([NTQQ, ONEBOT, FFMPEG])
        expect(config.entries.find((item: any) => item.name === NTQQ).config.autoLoginUin).toBe(['12345', '67890'][index])
        expect(config.entries.find((item: any) => item.name === ONEBOT).config.connect[0]).toMatchObject({
          port: 53000 + index, token: 'fixture-token', enable: true, host: '0.0.0.0',
        })
        expect(config.entries.some((item: any) => ['builtin:nt-protocol', 'builtin:onebot11'].includes(item.name))).toBe(false)
      }
      const suite = await json('api/config/test.config.json')
      expect(suite.accounts.primary).toMatchObject({ user_id: '12345', host: 'http://llbot-pr1:53000' })
      expect(suite.accounts.secondary).toMatchObject({ user_id: '67890', host: 'http://llbot-pr2:53001' })
      expect(suite.test_group_id).toBe('555')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects missing credentials and malformed account identifiers before starting QQ', () => {
    expect(() => instanceConfig('12345', 53000, '')).toThrow('token')
    expect(() => instanceConfig('wrong-account', 53000, 'token')).toThrow('account')
    expect(() => instanceConfig('12345', 70000, 'token')).toThrow('port')
  })
})
