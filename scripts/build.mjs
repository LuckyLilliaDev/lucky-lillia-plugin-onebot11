import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const root = path.resolve(import.meta.dirname, '..')
const backend = await build({
  absWorkingDir: root, entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true,
  format: 'esm', platform: 'node', target: 'node22', sourcemap: true, metafile: true,
  external: ['cordis', 'cosmokit', 'schemastery', '@luckylillia-dev/plugin-sdk', '@luckylillia-dev/plugin-sdk/*'],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
})
// Public NT models are bundled; the running NT plugin owns the action service and native resources.
const forbidden = Object.keys(backend.metafile.inputs).filter(file =>
  /(?:^|[/\\])(?:native|qqProtocol|direct-lib)(?:[/\\])/.test(file) || /LuckyLillia\.Bot[/\\]src/.test(file))
if (forbidden.length) throw new Error(`OneBot must only bundle NTQQ public helpers: ${forbidden.join(', ')}`)
await build({
  absWorkingDir: root, entryPoints: ['src/client/index.tsx'], outfile: 'lib/client/module.js', bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@luckylillia-dev/plugin-sdk/webui'],
})
const require = createRequire(import.meta.url)
const tw = path.dirname(require.resolve('tailwindcss/package.json')).split(path.sep).join('/')
const css = '@import "' + tw + '/theme.css" layer(theme);\n'
  + '@import "' + tw + '/utilities.css" layer(utilities) source(none);\n'
  + '@source "' + path.join(root, 'src/client').split(path.sep).join('/') + '";\n'
  + '@custom-variant dark (&:where(.dark, .dark *));\n'
const styled = await postcss([tailwind({ base: root, optimize: true })]).process(css, { from: path.join(root, 'client.css') })
await fs.writeFile(path.join(root, 'lib/client/style.css'), styled.css)
await fs.writeFile(path.join(root, 'lib/client/index.js'), `import apply from './module.js'
export default function(ctx) {
  if (ctx.style) { ctx.style('utilities', ${JSON.stringify(styled.css)}, { scope: 'plugin', when: 'loaded' }); return apply(ctx) }
  const style = document.createElement('link')
  style.rel = 'stylesheet'
  style.href = new URL('./style.css', import.meta.url).href
  document.head.append(style)
  try { const stop = apply(ctx); return () => { if (typeof stop === 'function') stop(); style.remove() } }
  catch (error) { style.remove(); throw error }
}
`)
await fs.mkdir(path.join(root, 'lib/types'), { recursive: true })
await fs.copyFile(path.join(root, 'src/config.ts'), path.join(root, 'lib/types/config.d.ts'))
await fs.writeFile(path.join(root, 'lib/types/index.d.ts'), `import type { Context, Schema } from '@luckylillia-dev/plugin-sdk'
import type { OB11Config } from './config'
export type Config = Omit<OB11Config, 'enable'>
export declare const Config: Schema<Config>
export declare const name: string
export declare const inject: string[]
export declare function apply(ctx: Context, config: Config): Promise<void>
`)
console.log('Built OneBot 11 adapter and WebUI')
