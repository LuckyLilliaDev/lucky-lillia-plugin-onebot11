import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))

function validateMetadata() {
  assert.equal(pkg.name, '@luckylillia-dev/plugin-onebot11')
  assert.match(pkg.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?$/, 'Use an npm release version without build metadata')
  assert.notEqual(pkg.private, true)
  assert.equal(pkg.repository?.type, 'git')
  assert.equal(pkg.repository?.url, 'git+https://github.com/LuckyLilliaDev/lucky-lillia-plugin-onebot11.git')
  assert.equal(pkg.publishConfig?.registry, 'https://registry.npmjs.org')
  assert.equal(pkg.publishConfig?.access, 'public')
  assert.equal(lock.name, pkg.name)
  assert.equal(lock.version, pkg.version)
  assert.equal(lock.packages[''].name, pkg.name)
  assert.equal(lock.packages[''].version, pkg.version)
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta']) {
    assert.deepEqual(lock.packages[''][field], pkg[field], 'Lockfile is out of date: ' + field)
  }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(pkg[field] ?? {})) {
      assert.ok(!/^(?:file:|link:|workspace:|\.{1,2}[/\\]|[/\\]|[A-Za-z]:[/\\])/.test(version), 'Local package dependency: ' + name)
    }
  }
  for (const [location, entry] of Object.entries(lock.packages)) {
    assert.ok(!entry.link && !/^(?:file:|link:)/.test(entry.resolved ?? ''), 'Local lockfile dependency: ' + location)
  }
}

validateMetadata()
switch (process.argv[2]) {
  case 'metadata': {
    assert.equal(process.env.GITHUB_REPOSITORY, 'LuckyLilliaDev/lucky-lillia-plugin-onebot11')
    if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
      assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Manual runs must use main')
    } else {
      assert.equal(process.env.GITHUB_EVENT_NAME, 'push')
      assert.equal(process.env.GITHUB_REF, 'refs/tags/v' + pkg.version, 'Tag must exactly match package.json version')
    }
    console.log('Validated ' + pkg.name + '@' + pkg.version)
    break
  }
  case 'pack': {
    const report = path.resolve(process.argv[3])
    const packs = JSON.parse(readFileSync(report, 'utf8'))
    assert.equal(packs.length, 1)
    const [pack] = packs
    assert.equal(pack.name, pkg.name)
    assert.equal(pack.version, pkg.version)
    assert.equal(pack.filename, 'luckylillia-dev-plugin-onebot11-' + pkg.version + '.tgz')
    for (const required of ['package.json', 'LICENSE', 'README.md', 'lib/index.js', 'lib/types/index.d.ts', 'lib/types/config.d.ts', 'lib/client/index.js', 'lib/client/module.js', 'lib/client/style.css']) {
      assert.ok(pack.files.some(file => file.path === required && file.size > 0), 'Missing package file: ' + required)
    }
    for (const file of pack.files) {
      assert.ok(/^(?:lib\/|package\.json$|README\.md$|LICENSE$)/.test(file.path), 'Unexpected package file: ' + file.path)
      assert.ok(!/(?:^|\/)(?:_integration|node_modules|data|output|\.git)(?:\/|$)/.test(file.path), 'Development files leaked into the package: ' + file.path)
    }
    assert.equal(pack.bundled.length, 0, 'Do not bundle linked development dependencies')
    const tarball = readFileSync(path.join(path.dirname(report), pack.filename))
    const integrity = 'sha512-' + createHash('sha512').update(tarball).digest('base64')
    assert.equal(integrity, pack.integrity, 'Tarball integrity does not match npm pack')
    const packedPackage = JSON.parse(execFileSync('tar', ['-xOf', path.join(path.dirname(report), pack.filename), 'package/package.json'], { encoding: 'utf8' }))
    assert.deepEqual(packedPackage, pkg, 'Packed package metadata differs from source')
    const npmTag = pkg.version.includes('-') ? 'next' : 'latest'
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, 'filename=' + pack.filename + '\nintegrity=' + integrity + '\nversion=' + pkg.version + '\nnpm_tag=' + npmTag + '\n')
    }
    console.log('Verified ' + pack.filename + ': ' + integrity)
    break
  }
  default:
    throw new Error('Usage: node scripts/release.mjs metadata | pack <npm-pack-report.json>')
}
