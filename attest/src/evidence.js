// Evidence producers. These run on the VENDOR side, against a system the
// vendor owns, and each one answers a different kind of question.
//
// Hacker Bob's local runtime is the intended producer for the scan methods.
// npm audit and source inspection are the fallbacks that keep the evidence
// genuine if Bob will not install in time. Whichever ran is recorded in
// `method` and travels with the bundle, because an attestation that hides
// how it was produced is not evidence.
const { execSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const BLOCKING = ['high', 'critical']
const vendors = require('../vendors.json')

// A bank assesses a portfolio, not one supplier. Every collector takes the
// vendor it is assessing, so the same control set runs against any of them and
// the receipts say which system was actually looked at.
function resolveVendor(id) {
  const v = vendors.find(v => v.id === (id || vendors[0].id))
  if (!v) throw new Error(`Unknown vendor ${id}. Known: ${vendors.map(v => v.id).join(', ')}`)
  return { ...v, dir: path.resolve(__dirname, '../..', v.target) }
}

// --- collectors -----------------------------------------------------------

function dependencyScan(TARGET) {
  let raw
  try {
    // Static command, no interpolation, so the shell carries no injection surface.
    raw = execSync('npm audit --json', {
      cwd: TARGET, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch (err) {
    raw = err.stdout // npm audit exits non-zero whenever it finds anything
  }
  if (!raw) throw new Error('npm audit produced no output')
  const report = JSON.parse(raw)
  const findings = []
  for (const [name, v] of Object.entries(report.vulnerabilities || {})) {
    for (const via of v.via || []) {
      if (typeof via === 'string') continue
      findings.push({
        severity: via.severity || v.severity,
        subject: name,
        title: via.title || null,
        citation: via.url || null
      })
    }
  }
  return { method: 'npm-audit', raw, findings }
}

// Prototype-pollution sinks reachable from request data. Deliberately narrow:
// a pattern matcher that claims more than it can see is the same failure mode
// as a vendor that claims more than it can prove.
const SINKS = [
  { re: /_\.merge\s*\(\s*[^)]*req\.body/, title: 'lodash merge called directly on request body (prototype pollution sink)' },
  { re: /Object\.assign\s*\(\s*[^)]*req\.body/, title: 'Object.assign called directly on request body' }
]

function sourcePattern(TARGET) {
  const file = path.join(TARGET, 'server.js')
  const src = fs.readFileSync(file, 'utf8')
  const findings = []
  for (const sink of SINKS) {
    const m = src.match(sink.re)
    if (!m) continue
    const line = src.slice(0, m.index).split('\n').length
    findings.push({
      severity: 'high',
      subject: `server.js:${line}`,
      title: sink.title,
      citation: 'https://github.com/advisories/GHSA-p6mc-m468-83gw'
    })
  }
  return { method: 'source-pattern', raw: src, findings }
}

function lockfilePresent(TARGET) {
  const file = path.join(TARGET, 'package-lock.json')
  const exists = fs.existsSync(file)
  const raw = exists ? fs.readFileSync(file, 'utf8') : ''
  return {
    method: 'lockfile-check',
    raw: raw || 'absent',
    findings: exists ? [] : [{
      severity: 'high', subject: 'package-lock.json',
      title: 'No committed lockfile; dependency versions are not pinned', citation: null
    }]
  }
}

// Live credential shapes. Narrow on purpose: a matcher that guesses produces
// findings a vendor cannot act on, which is worse than finding nothing.
const SECRET_PATTERNS = [
  { re: /(?:api|payment|client)?_?(?:secret|api_key|token)\s*=\s*['"][A-Za-z0-9_]{24,}['"]/i, title: 'Hardcoded credential assigned in source' },
  { re: /AKIA[0-9A-Z]{16}/, title: 'AWS access key id committed to source' },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, title: 'Private key committed to source' }
]

function secretScan(TARGET) {
  const file = path.join(TARGET, 'server.js')
  const src = fs.readFileSync(file, 'utf8')
  const findings = []
  for (const p of SECRET_PATTERNS) {
    const m = src.match(p.re)
    if (!m) continue
    const line = src.slice(0, m.index).split('\n').length
    findings.push({ severity: 'critical', subject: `server.js:${line}`, title: p.title, citation: null })
  }
  return { method: 'secret-scan', raw: src, findings }
}

const COLLECTORS = {
  dependency_scan: dependencyScan,
  source_pattern: sourcePattern,
  lockfile_present: lockfilePresent,
  secret_scan: secretScan
}

// --- bundle ---------------------------------------------------------------

function collect(control, vendorId) {
  const collector = COLLECTORS[control.evidence_method]
  if (!collector) throw new Error(`No collector for method: ${control.evidence_method}`)
  const vendor = resolveVendor(vendorId)
  const { method, raw, findings } = collector(vendor.dir)
  return {
    control_id: control.id,
    vendor: vendor.id,
    vendor_name: vendor.name,
    target: vendor.service,
    method,
    collected_at: new Date().toISOString(),
    findings,
    blocking: findings.filter(f => BLOCKING.includes(f.severity)).length,
    raw_digest: createHash('sha256').update(raw).digest('hex')
  }
}

module.exports = { collect, BLOCKING, vendors, resolveVendor }
