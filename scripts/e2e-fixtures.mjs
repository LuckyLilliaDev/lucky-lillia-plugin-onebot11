import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const NTQQ = '@luckylillia/plugin-nt-protocol'
export const ONEBOT = '@luckylillia/plugin-onebot11'
export const FFMPEG = 'lucky-lillia-plugin-ffmpeg'

export function instanceConfig(uin, port, token) {
  if (!/^[1-9][0-9]*$/.test(uin)) throw new Error('Expected a numeric QQ account ID')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid OneBot listening port')
  if (!token) throw new Error('E2E listeners require a token')
  return { version: 1, trusted: [NTQQ, ONEBOT], entries: [
    { id: 'ntqq', name: NTQQ, config: { mode: 'nativeqq', nativeQQ: { qqPath: '/opt/QQ/qq' }, autoLoginUin: uin } },
    { id: 'onebot', name: ONEBOT, config: { connect: [{ type: 'http', enable: true, host: '0.0.0.0', port, token,
      messageFormat: 'array', reportSelfMessage: false, reportOfflineMessage: false, debug: false }] } },
    { id: 'satori', name: 'builtin:satori', disabled: true },
    { id: 'official', name: 'builtin:qq-official', disabled: true },
    { id: 'email', name: 'builtin:email-notification', disabled: true },
  ] }
}

export async function writeFixtures(root, options = {}) {
  const accounts = [options.primary ?? '1577491075', options.secondary ?? '412805684']
  const token = options.token ?? 'llbot-e2e'
  const group = options.group ?? '1098066573'
  for (let index = 0; index < 2; index++) {
    const data = path.join(root, `workspace${index + 1}`, 'data')
    const instance = path.join(data, 'instances/default')
    await fs.mkdir(instance, { recursive: true })
    const plugins = instanceConfig(accounts[index], 53000 + index, token)
    if (options.ffmpeg) {
      plugins.trusted.push(FFMPEG)
      plugins.entries.push({ id: 'ffmpeg', name: FFMPEG })
    }
    await fs.writeFile(path.join(instance, 'plugins.json'), JSON.stringify(plugins, null, 2))
    await fs.writeFile(path.join(instance, 'settings.json'), JSON.stringify({ log: true, webui: { host: '127.0.0.1', port: 3091 + index } }, null, 2))
    await fs.writeFile(path.join(data, 'nativeqq_config.json'), JSON.stringify({ qq_path: '/opt/QQ/qq',
      quick_login_qq: accounts[index], hook_mode: 'inline', qq_args: '--no-sandbox', work_dir: '/app/llbot/data' }))
  }
  const account = index => ({ host: `http://llbot-pr${index + 1}:${53000 + index}`, apiKey: token, protocol: 'http', user_id: accounts[index] })
  const test = { accounts: { primary: account(0), secondary: account(1) }, test_group_id: group, timeout: 30000, retryAttempts: 3 }
  await fs.mkdir(path.join(root, 'api/config'), { recursive: true })
  await fs.mkdir(path.join(root, 'tmp'), { recursive: true })
  await fs.writeFile(path.join(root, 'api/config/test.config.json'), JSON.stringify(test, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node e2e-fixtures.mjs <output-directory>')
  await writeFixtures(path.resolve(process.argv[2]), { primary: process.env.E2E_PRIMARY_QQ, secondary: process.env.E2E_SECONDARY_QQ,
    group: process.env.E2E_GROUP_ID, token: process.env.E2E_TOKEN })
}
