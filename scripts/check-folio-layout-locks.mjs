import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const root = path.resolve('portfolio_subproject/yifang')
const manifestPath = path.join(root, 'layout-locks.json')
const args = process.argv.slice(2)
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const relative = file => path.relative(process.cwd(), file).replaceAll('\\', '/')
function validatePageScopes() {
  const postcss = createRequire(import.meta.url)('postcss')
  const scopes = {
    cover: ['hero', 'cover-type', 'wheel', 'down', 'dot', 'period'],
    'work-index': ['index'],
    'case-opening': ['case__', 'stage', 'shape'],
    'case-brief': ['brief'],
    'case-themes': ['theme', 'demo'],
    'case-details': ['details', 'affiliations'],
    archive: ['archive'], about: ['about'], 'media-samples': ['samples', 'sample-open'],
  }
  for (const [name, prefixes] of Object.entries(scopes)) {
    const ast = postcss.parse(fs.readFileSync(path.join(root, 'styles', name + '.css'), 'utf8'))
    ast.walkRules(rule => {
      for (const selector of postcss.list.comma(rule.selector)) {
        const first = [...selector.matchAll(/\.folio-([\w-]+)/g)].map(x => x[1]).find(x => x !== 'site' && !x.startsWith('site--'))
        if (!first || !prefixes.some(prefix => first.startsWith(prefix))) throw Error(`${name}: selector escapes its page owner: ${selector}`)
      }
    })
  }
}
function owner(file) {
  if (file.startsWith('scripts/')) return 'verification'
  if (file.includes('/styles/')) return path.basename(file, '.css')
  if (file.endsWith('/ui/PageActions.vue')) return 'page-actions'
  if (file.endsWith('/DesignLab.vue')) return 'design-lab'
  if (file.endsWith('/useFolioCursor.ts')) return 'cursor'
  if (file.endsWith('/copy.json')) return 'approved-copy'
  return 'shared-host'
}
function sourceFiles() {
  const files = []
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name === 'local' || item.name === 'layout-locks.json') continue
      const file = path.join(dir, item.name)
      if (item.isDirectory()) walk(file)
      else if (/\.(?:css|vue|ts|json)$/.test(item.name)) files.push(file)
    }
  }
  walk(root)
  for (const file of ['src/App.vue', 'src/uni.scss', 'src/pages/yifang-wang.vue', 'src/components/H5AnimatedImage.vue', 'scripts/check-folio-layout-locks.mjs', 'scripts/folio-layout-snapshot.mjs', 'scripts/folio-layout-fixture.html']) {
    if (fs.existsSync(file)) files.push(path.resolve(file))
  }
  return Object.fromEntries(files.sort().map(file => [relative(file), { owner: owner(relative(file)), sha256: hash(file) }]))
}
function compare(beforeFile, afterFile) {
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'))
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'))
  const failures = [], reviewed = []
  for (const reference of before) {
    const key = reference.viewport.join('x')
    const actual = after.find(x => x.viewport.join('x') === key)
    if (!actual) { failures.push(key + ': missing viewport'); continue }
    if (actual.width !== reference.width) { failures.push(key + ': viewport content width changed'); continue }
    if (actual.overflow) failures.push(key + ': horizontal overflow')
    if (actual.pages.length !== reference.pages.length) failures.push(key + ': page count changed')
    for (const page of reference.pages) {
      const current = actual.pages.find(p => p.id === page.id)
      if (!current) { failures.push(key + ': missing ' + page.id); continue }
      if (current.height < actual.available - 1) failures.push(key + ': collapsed ' + page.id)
      if (page.id === 'work') { reviewed.push(key + ': Selected Work restoration'); continue }
      const details = page.id.endsWith('-details')
      if (!details && Math.abs(page.height - current.height) > 1) failures.push(key + ': height changed ' + page.id)
      if (page.nodes.length !== current.nodes.length) { failures.push(key + ': content nodes changed ' + page.id); continue }
      for (let i = 0; i < page.nodes.length; i++) {
        for (const [property, value] of Object.entries(page.nodes[i])) {
          const next = current.nodes[i][property]
          if (typeof value === 'number' ? Math.abs(value - next) > 1 : value !== next) {
            failures.push(`${key}: ${page.id} node ${i} ${property}: ${value} -> ${next}`)
          }
        }
      }
    }
  }
  console.log(JSON.stringify({ viewports: before.length, comparedPages: before.reduce((n, x) => n + x.pages.length, 0), authorizedIndexChanges: reviewed.length, failures }, null, 2))
  if (failures.length) process.exitCode = 1
}

validatePageScopes()
if (args[0] === '--compare') {
  compare(args[1], args[2])
} else if (args[0] === '--initialize') {
  if (fs.existsSync(manifestPath)) throw Error('Layout locks already exist; use an explicitly authorized owner update.')
  const baseline = JSON.parse(fs.readFileSync(args[1], 'utf8'))
  const manifest = {
    version: 1,
    locked: true,
    backup: '.local-backups/yifang-20261111-172947',
    contract: 'Independent pages. Approved body geometry is frozen; explicit page-owner changes only.',
    viewports: baseline.map(x => x.viewport),
    pages: [...new Map(baseline.flatMap(x => x.pages).map(x => [x.id, { id: x.id, label: x.label, locked: true }])).values()],
    files: sourceFiles(),
    updates: [{ reason: 'User-authorized style ownership, footer integration, cursor fill and Selected Work restoration.', owners: ['work-index', 'case-details', 'design-lab', 'page-actions', 'cursor'], date: '2026-11-11' }],
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('Initialized locked source manifest.')
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const current = sourceFiles()
  const changes = [...new Set([...Object.keys(manifest.files), ...Object.keys(current)])]
    .filter(file => manifest.files[file]?.sha256 !== current[file]?.sha256)
    .map(file => ({ file, owner: current[file]?.owner || manifest.files[file]?.owner }))
  if (args[0] === '--accept') {
    const owners = new Set((args[1] || '').split(','))
    const reasonIndex = args.indexOf('--reason')
    const reason = reasonIndex >= 0 ? args[reasonIndex + 1] : ''
    if (!reason || changes.some(x => !owners.has(x.owner))) throw Error('A reason and explicit authorization for every changed owner are required.')
    manifest.files = current
    manifest.updates.push({ owners: [...owners], reason, date: new Date().toISOString() })
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  } else if (changes.length) {
    console.log(JSON.stringify({ lockedLayoutChanges: changes }, null, 2))
    process.exitCode = 1
  } else console.log(`Layout locks passed: ${manifest.pages.length} pages, ${Object.keys(current).length} source files.`)
}
