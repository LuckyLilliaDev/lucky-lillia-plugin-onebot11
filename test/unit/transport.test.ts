import { afterEach, describe, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocket } from 'ws'
import { BaseAction, ActionName, OB11Response } from '@luckylillia/plugin-nt-protocol/onebot'
import type { Context } from 'cordis'
import { OB11Http } from '../../src/connect/http'
import { OB11WebSocket } from '../../src/connect/ws'
import { initActionMap } from '../../src/action'
import { OB11Schema, validateListeners } from '../../src/settings'

const stops: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const stop of stops.splice(0).reverse()) await stop() })

const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
function accountContext() {
  return { logger, qqProtocol: { selfInfo: { uin: '12345', online: true } },
    interval: () => () => {}, setTimeout: () => () => {},
    get: () => ({ version: '9.test' }), ntOnebot: { actionMap: new Map() },
  } as unknown as Context
}

class Login extends BaseAction<{}, { user_id: number }> {
  actionName = ActionName.GetLoginInfo
  async _handle() { return { user_id: 12345 } }
}

function connections(ctx: Context) {
  const login = new Login({ ctx })
  ctx.ntOnebot.actionMap.set('get_login_info', login)
  return initActionMap({ ctx })
}
const common = { enable: true, host: '127.0.0.1', port: 0, token: 'test-token',
  reportSelfMessage: false, reportOfflineMessage: false, debug: false, messageFormat: 'array' as const }

describe('standalone OneBot transport', () => {
  it('serves HTTP actions with authentication, JSON errors and port release', async () => {
    const ctx = accountContext()
    const http = new OB11Http(ctx, { ...common, type: 'http', actionMap: connections(ctx) })
    stops.push(() => http.stop())
    http.start()
    const server = (http as any).server
    if (!server.listening) await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const base = `http://127.0.0.1:${port}`
    const unauthorized = await fetch(`${base}/get_login_info`)
    expect(unauthorized.status).toBe(403)
    const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }
    const result = await fetch(`${base}/get_login_info`, { method: 'POST', headers, body: '{}' })
    expect(await result.json()).toMatchObject({ status: 'ok', retcode: 0, data: { user_id: 12345 } })
    const bad = await fetch(`${base}/get_login_info`, { method: 'POST', headers, body: '{' })
    expect(await bad.json()).toMatchObject({ status: 'failed', retcode: 400 })
    const missing = await fetch(`${base}/not_an_action`, { headers })
    expect(missing.status).toBe(404)
    await http.stop()
    // Reusing the same listening port catches leaked servers after plugin reload.
    const next = new OB11Http(ctx, { ...common, port, type: 'http', actionMap: connections(ctx) })
    stops.push(() => next.stop())
    next.start()
    if (!(next as any).server.listening) await once((next as any).server, 'listening')
  })

  it('replies over WebSocket with echo and closes the listener on stop', async () => {
    const ctx = accountContext()
    const transport = new OB11WebSocket(ctx, { ...common, type: 'ws', heartInterval: 60000, actionMap: connections(ctx) })
    stops.push(() => transport.stop())
    transport.start()
    const server = (transport as any).wsServer
    if (!server.address()) await once(server, 'listening')
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api`
    const socket = new WebSocket(url, { headers: { Authorization: 'Bearer test-token' } })
    stops.push(async () => { socket.terminate() })
    await once(socket, 'open')
    const reply = once(socket, 'message')
    socket.send(JSON.stringify({ action: 'get_login_info', params: {}, echo: 'echo-1' }))
    expect(JSON.parse((await reply)[0].toString())).toEqual(OB11Response.ok({ user_id: 12345 }, 'echo-1'))
    const closed = once(socket, 'close')
    await transport.stop()
    await closed
  })

  it('adds connection actions without mutating the account API', () => {
    const ctx = accountContext()
    const actions = connections(ctx)
    expect(actions.get('get_login_info')).toBe(ctx.ntOnebot.actionMap.get('get_login_info'))
    expect(actions.has('get_event')).toBe(true)
    expect(actions.has('.handle_quick_operation')).toBe(true)
    expect(ctx.ntOnebot.actionMap.has('get_event')).toBe(false)
    expect(actions.get('get_event_async')).toBe(actions.get('get_event'))
  })
})

describe('OneBot settings', () => {
  it('preserves existing connection fields and supports all four transports', () => {
    const parsed = OB11Schema({ connect: [
      { type: 'http', name: null, filter: null, customField: 'preserved' },
      { type: 'ws' }, { type: 'ws-reverse', url: 'ws://127.0.0.1:9000' },
      { type: 'http-post', url: 'http://127.0.0.1:9000' },
    ] })
    expect(parsed.connect).toHaveLength(4)
    expect(parsed.connect[0]).toMatchObject({ host: '127.0.0.1', port: 3000, customField: 'preserved' })
    expect(() => validateListeners(parsed)).not.toThrow()
  })
  it.each(['', '0.0.0.0', '::'])('requires a token only for enabled public listeners on %s', host => {
    const config = OB11Schema({ connect: [{ type: 'http', enable: true, host }] })
    expect(() => validateListeners(config)).toThrow('Token')
    config.connect[0].enable = false
    expect(() => validateListeners(config)).not.toThrow()
    config.connect[0].enable = true
    config.connect[0].token = 'token'
    expect(() => validateListeners(config)).not.toThrow()
  })
})
