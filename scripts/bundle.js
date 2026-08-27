// Rebuilds worker/data.json from the real vendor apps.
// Run this whenever a vendor app changes, or the deployed digests stop matching
// the local ones and cached judgments silently miss.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process')
const root = path.resolve(__dirname, '..')
const vendors = require(path.join(root, 'attest/vendors.json'))
const bundle = {
  generated_at: new Date().toISOString(),
  vendors: {},
  controls: require(path.join(root, 'attest/controls.json')),
  vendorMeta: vendors,
  judgeCache: JSON.parse(fs.readFileSync(path.join(root, 'attest/judge-cache.json'), 'utf8'))
}
for (const v of vendors) {
  const dir = path.join(root, v.target)
  let audit
  try {
    audit = cp.execSync('npm audit --json', { cwd: dir, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) { audit = e.stdout }
  const lock = path.join(dir, 'package-lock.json')
  bundle.vendors[v.id] = {
    name: v.name, service: v.service,
    audit_raw: audit,
    source: fs.readFileSync(path.join(dir, 'server.js'), 'utf8'),
    lockfile: fs.existsSync(lock) ? fs.readFileSync(lock, 'utf8') : null
  }
}
fs.writeFileSync(path.join(root, 'worker/data.json'), JSON.stringify(bundle))
console.log('worker/data.json rebuilt:', (fs.statSync(path.join(root, 'worker/data.json')).size / 1024).toFixed(1) + 'kb')
