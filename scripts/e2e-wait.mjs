import { setTimeout as delay } from 'node:timers/promises'

const deadline = Date.now() + 300000
while (Date.now() < deadline) {
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.API_PORT}/get_login_info`, {
      headers: { Authorization: `Bearer ${process.env.E2E_TOKEN}` }, signal: AbortSignal.timeout(4000),
    })
    const body = await response.json()
    if (response.ok && body.retcode === 0 && String(body.data?.user_id) === process.env.EXPECTED_QQ) process.exit(0)
  } catch {}
  await delay(2000)
}
throw new Error('NTQQ/OneBot login readiness timed out')
