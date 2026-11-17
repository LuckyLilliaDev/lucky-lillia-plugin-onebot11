import { afterEach, describe, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Context } from 'cordis'
import { WebSocket, WebSocketServer } from 'ws'
import { ActionName, BaseAction, OB11BaseEvent } from '@luckylillia/plugin-nt-protocol/onebot'
import { OB11Http, OB11HttpPost } from '../../src/connect/http'
import { OB11WebSocket, OB11WebSocketReverse } from '../../src/connect/ws'
import { initActionMap } from '../../src/action'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => {
  for (const stop of cleanup.splice(0).reverse()) await stop()
})

function context() {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    qqProtocol: { selfInfo: { uin: '12345', online: true } },
    interval: (fn: () => void, ms: number) => {
      const timer = setInterval(fn, ms)
      const stop = () => clearInterval(timer)
      cleanup.push(stop)
      return stop
    },
    timeout: (fn: () => void, ms: number) => {
      const timer = setTimeout(fn, Math.min(ms, 30))
      const stop = () => clearTimeout(timer)
      cleanup.push(stop)
      return stop
    },
    get: () => ({ version: 'test' }),
    ntOnebot: { actionMap: new Map() },
  } as unknown as Context
}

class Login extends BaseAction<{}, { user_id: number }> {
  actionName = ActionName.GetLoginInfo
  async _handle() { return { user_id: 12345 } }
}

function actions(ctx: Context) {
  const login = new Login({ ctx })
  for (const suffix of ['', '_async', '_rate_limited']) ctx.ntOnebot.actionMap.set('get_login_info' + suffix, login)
  return initActionMap({ ctx })
}

const common = { enable: true, token: 'fixture-token', reportSelfMessage: false,
  reportOfflineMessage: false, debug: false, messageFormat: 'array' as const }

function event(postType = 'notice') {
  return Object.assign(Object.create(OB11BaseEvent.prototype), {
    post_type: postType, notice_type: 'group_card', group_id: 555, user_id: 67890,
    message: [{ type: 'text', data: { text: 'hello' } }], raw_message: 'hello', raw: { private: true }, raw_pb: 'private',
    getSummaryEventName: () => postType,
  }) as OB11BaseEvent
}

async function httpTransport() {
  const ctx = context()
  const transport = new OB11Http(ctx, { ...common, type: 'http', host: '127.0.0.1', port: 0, actionMap: actions(ctx) })
  cleanup.push(() => transport.stop())
  transport.start()
  const server = (transport as any).server
  if (!server.listening) await once(server, 'listening')
  return { ctx, transport, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}

async function wsTransport() {
  const ctx = context()
  const transport = new OB11WebSocket(ctx, { ...common, type: 'ws', host: '127.0.0.1', port: 0, heartInterval: 30, actionMap: actions(ctx) })
  cleanup.push(() => transport.stop())
  transport.start()
  const server = (transport as any).wsServer
  if (!server.address()) await once(server, 'listening')
  return { ctx, transport, base: `ws://127.0.0.1:${(server.address() as AddressInfo).port}` }
}

function messages(socket: WebSocket) {
  const queue: any[] = []
  socket.on('message', data => queue.push(JSON.parse(data.toString())))
  return async (match: (value: any) => boolean) => {
    await vi.waitFor(() => expect(queue.some(match)).toBe(true), { timeout: 1500, interval: 5 })
    return queue.splice(queue.findIndex(match), 1)[0]
  }
}

describe('HTTP integration', () => {
  it('accepts bearer and query tokens, GET and form requests, and action aliases', async () => {
    const { base } = await httpTransport()
    for (const suffix of ['', '_async', '_rate_limited']) {
      const response = await fetch(`${base}/get_login_info${suffix}?access_token=fixture-token`)
      expect(await response.json()).toMatchObject({ status: 'ok', data: { user_id: 12345 } })
    }
    const response = await fetch(`${base}/get_login_info`, { method: 'POST',
      headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' })
    expect(await response.json()).toMatchObject({ status: 'ok' })
    expect((await fetch(`${base}/_events?access_token=wrong`)).status).toBe(403)
  })

  it('streams SSE events and releases connected streams on stop', async () => {
    const { base, transport } = await httpTransport()
    const abort = new AbortController()
    cleanup.push(() => abort.abort())
    const response = fetch(`${base}/_events?access_token=fixture-token`, { signal: abort.signal })
    await vi.waitFor(() => expect((transport as any).sseClients.size).toBe(1))
    await transport.emitEvent(event())
    const stream = await response
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    const reader = stream.body!.getReader()
    const chunk = new TextDecoder().decode((await reader.read()).value)
    expect(chunk).toContain('"self_id":12345')
    expect(chunk).toContain('"post_type":"notice"')
    await transport.stop()
    await expect(reader.read()).rejects.toThrow()
  })

  it('delivers long polling events once per independent consumer', async () => {
    const { base, transport } = await httpTransport()
    const call = (key: string, timeout = 0) => fetch(`${base}/get_event?access_token=fixture-token&key=${key}&timeout=${timeout}`).then(r => r.json())
    await call('consumer-a')
    await call('consumer-b')
    const pending = call('consumer-a', 1000)
    await transport.emitEvent(event())
    expect((await pending).data).toHaveLength(1)
    expect((await call('consumer-a')).data).toEqual([])
    expect((await call('consumer-b')).data).toHaveLength(1)
  })
})

describe('forward WebSocket integration', () => {
  it.each([null, true, 42, 'text', [], {}])('rejects invalid request %j without breaking the connection', async payload => {
    const { base } = await wsTransport()
    const socket = new WebSocket(`${base}/api`, { headers: { Authorization: 'Bearer fixture-token' } })
    cleanup.push(() => socket.terminate())
    const next = messages(socket)
    await once(socket, 'open')
    socket.send(JSON.stringify(payload))
    expect(await next(v => v.status === 'failed')).toMatchObject({ retcode: 1400 })
    socket.send(JSON.stringify({ action: 'get_login_info', echo: 'still-alive' }))
    expect(await next(v => v.echo === 'still-alive')).toMatchObject({ status: 'ok' })
  })

  it('rejects invalid tokens and accepts query authentication', async () => {
    const { base } = await wsTransport()
    const rejected = new WebSocket(`${base}/?access_token=wrong`)
    cleanup.push(() => rejected.terminate())
    const closed = once(rejected, 'close')
    expect((await closed)[0]).toBe(1008)
    const accepted = new WebSocket(`${base}/api?access_token=fixture-token`)
    cleanup.push(() => accepted.terminate())
    const next = messages(accepted)
    await once(accepted, 'open')
    accepted.send(JSON.stringify({ action: 'get_login_info', echo: { id: 7 } }))
    expect(await next(v => v.echo?.id === 7)).toMatchObject({ status: 'ok', echo: { id: 7 } })
  })

  it('reports lifecycle, heartbeat, notices and ping/pong on the universal endpoint', async () => {
    const { base, transport } = await wsTransport()
    const socket = new WebSocket(`${base}/`, { headers: { Authorization: 'Bearer fixture-token' } })
    cleanup.push(() => socket.terminate())
    const next = messages(socket)
    await once(socket, 'open')
    expect(await next(v => v.meta_event_type === 'lifecycle')).toMatchObject({ sub_type: 'connect', self_id: 12345 })
    expect(await next(v => v.meta_event_type === 'heartbeat')).toMatchObject({ status: { online: true, good: true }, interval: 30 })
    await transport.emitEvent(event())
    expect(await next(v => v.post_type === 'notice')).toMatchObject({ group_id: 555 })
    const pong = once(socket, 'pong')
    socket.ping('probe')
    expect((await pong)[0].toString()).toBe('probe')
  })

  it('returns correlated errors for malformed JSON and unknown actions, then remains usable', async () => {
    const { base } = await wsTransport()
    const socket = new WebSocket(`${base}/api`, { headers: { Authorization: 'Bearer fixture-token' } })
    cleanup.push(() => socket.terminate())
    const next = messages(socket)
    await once(socket, 'open')
    socket.send('{"echo":{"id":1},"action":')
    expect(await next(v => v.echo?.id === 1)).toMatchObject({ status: 'failed', retcode: 1400 })
    socket.send(JSON.stringify({ action: 'does_not_exist', echo: 2 }))
    expect(await next(v => v.echo === 2)).toMatchObject({ status: 'failed', retcode: 1404 })
    socket.send(JSON.stringify({ action: 'get_login_info', echo: 3 }))
    expect(await next(v => v.echo === 3)).toMatchObject({ status: 'ok' })
  })
})

describe('reverse WebSocket integration', () => {
  it('provides handshake identity, API replies, heartbeats, reconnect and stop', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    cleanup.push(() => new Promise<void>(resolve => { for (const socket of server.clients) socket.terminate(); server.close(() => resolve()) }))
    if (!server.address()) await once(server, 'listening')
    const connections: { socket: WebSocket; headers: any; next: ReturnType<typeof messages> }[] = []
    server.on('connection', (socket, req) => connections.push({ socket, headers: req.headers, next: messages(socket) }))
    const ctx = context()
    const transport = new OB11WebSocketReverse(ctx, { ...common, type: 'ws-reverse',
      url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`, heartInterval: 30, actionMap: actions(ctx) })
    cleanup.push(() => transport.stop())
    transport.start()
    await vi.waitFor(() => expect(connections).toHaveLength(1))
    const peer = connections[0]
    expect(peer.headers).toMatchObject({ 'x-self-id': '12345', 'authorization': 'Bearer fixture-token', 'x-client-role': 'Universal' })
    expect(await peer.next(v => v.meta_event_type === 'lifecycle')).toMatchObject({ sub_type: 'connect' })
    peer.socket.send(JSON.stringify({ action: 'get_login_info', echo: 'reverse' }))
    expect(await peer.next(v => v.echo === 'reverse')).toMatchObject({ status: 'ok', data: { user_id: 12345 } })
    for (const payload of [null, true, 42, 'text', [], {}]) {
      peer.socket.send(JSON.stringify(payload))
      expect(await peer.next(v => v.status === 'failed')).toMatchObject({ retcode: 1400 })
    }
    expect(await peer.next(v => v.meta_event_type === 'heartbeat')).toMatchObject({ self_id: 12345 })
    const reconnected = once(server, 'connection')
    peer.socket.close()
    await reconnected
    expect(connections).toHaveLength(2)
    transport.stop()
    await vi.waitFor(() => expect([...server.clients].every(socket => socket.readyState === WebSocket.CLOSED)).toBe(true))
  })
})

describe('HTTP POST integration', () => {
  it('signs exact event bytes and stops sending after disposal', async () => {
    const requests: { body: string; headers: any }[] = []
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      requests.push({ body: Buffer.concat(chunks).toString(), headers: req.headers })
      res.writeHead(204).end()
    })
    cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())))
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const ctx = context()
    const transport = new OB11HttpPost(ctx, { ...common, type: 'http-post',
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, enableHeart: false, heartInterval: 30 })
    cleanup.push(() => transport.stop())
    transport.start()
    await transport.emitEvent(event())
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    const first = requests[0]
    expect(first.headers['x-self-id']).toBe('12345')
    expect(first.headers['x-signature']).toBe('sha1=' + createHmac('sha1', common.token).update(first.body).digest('hex'))
    expect(JSON.parse(first.body)).toMatchObject({ self_id: 12345, post_type: 'notice' })
    transport.stop()
    await transport.emitEvent(event())
    expect(requests).toHaveLength(1)
  })
})

describe.each([OB11Http, OB11HttpPost, OB11WebSocket, OB11WebSocketReverse])('message reporting for %s', Transport => {
  it('applies self/offline switches, debug fields, event filters and CQ string format', async () => {
    const transport = new (Transport as any)(context(), { ...common, messageFormat: 'string' })
    const report = vi.spyOn(transport, 'emitEvent').mockResolvedValue(undefined)
    await transport.emitMessageLikeEvent(event('message'), true, false)
    await transport.emitMessageLikeEvent(event('message'), false, true)
    expect(report).not.toHaveBeenCalled()
    const message = event('message')
    await transport.emitMessageLikeEvent(message, false, false)
    expect(report).toHaveBeenCalledOnce()
    expect(message).toMatchObject({ message: 'hello', message_format: 'string' })
    expect(message).not.toHaveProperty('raw')
    expect(message).not.toHaveProperty('raw_pb')
    transport.updateConfig({ reportSelfMessage: true, reportOfflineMessage: true, debug: true, messageFormat: 'array' })
    const debug = event('message')
    await transport.emitMessageLikeEvent(debug, true, true)
    expect(debug).toHaveProperty('raw')
    expect(debug).toHaveProperty('raw_pb')
    expect(Array.isArray((debug as any).message)).toBe(true)
  })
})
