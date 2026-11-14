import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeFixtures } from './e2e-fixtures.mjs'

const onebot = path.resolve(import.meta.dirname, '..')
if (!process.env.BOT_DIR || !process.env.NTQQ_PLUGIN_DIR) throw new Error('Set BOT_DIR and NTQQ_PLUGIN_DIR to source checkouts')
if (!process.env.FFMPEG_PLUGIN_DIR) throw new Error('Set FFMPEG_PLUGIN_DIR to the media plugin checkout for the complete API suite')
const bot = await fs.realpath(process.env.BOT_DIR)
const ntqq = await fs.realpath(process.env.NTQQ_PLUGIN_DIR)
const ffmpeg = process.env.FFMPEG_PLUGIN_DIR ? await fs.realpath(process.env.FFMPEG_PLUGIN_DIR) : undefined
const output = path.resolve(process.env.E2E_ROOT ?? path.join(bot, 'output/onebot-e2e'))
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' })

if (process.env.E2E_SKIP_BUILD !== '1') {
  for (const source of [ntqq, onebot]) {
    run('npm', ['ci'], source)
    if (source === onebot) run(process.execPath, ['scripts/use-ntqq.mjs', ntqq], source)
    for (const script of ['check', 'test', 'build']) run('npm', ['run', script], source)
  }
  if (ffmpeg) run('npm', ['run', 'build'], ffmpeg)
}
await fs.mkdir(path.join(output, 'packages'), { recursive: true })
const sources = [['ntqq', ntqq], ['onebot', onebot]]
if (ffmpeg) sources.push(['ffmpeg', ffmpeg])
for (const [label, source] of sources) {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', path.join(output, 'packages')], { cwd: source, encoding: 'utf8' }))[0]
  const artifact = path.join(output, 'packages', packed.filename)
  const target = path.join(output, 'plugins', label)
  await fs.mkdir(target, { recursive: true })
  run('tar', ['-xzf', artifact, '--strip-components=1', '-C', target], output)
  run('npm', ['install', '--omit=dev', '--ignore-scripts', '--legacy-peer-deps', '--package-lock=false'], target)
  if (label === 'ntqq') await fs.copyFile(artifact, path.join(output, 'ntqq.tgz'))
}
const suite = path.join(onebot, 'test/api')
await fs.cp(suite, path.join(output, 'api'), { recursive: true, filter: file => {
  const relative = path.relative(suite, file).split(path.sep).join('/')
  return !relative.split('/').some(part => ['node_modules', 'coverage', 'dist'].includes(part))
    && !['config/test.config.json', 'test-report.html'].includes(relative) && !relative.startsWith('tests/media/generated')
} })
await writeFixtures(output, { primary: process.env.E2E_PRIMARY_QQ, secondary: process.env.E2E_SECONDARY_QQ,
  group: process.env.E2E_GROUP_ID, token: process.env.E2E_TOKEN, ffmpeg: !!ffmpeg })
console.log('Prepared packed external plugins and isolated OneBot E2E fixtures')
