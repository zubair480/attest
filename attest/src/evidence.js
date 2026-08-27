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

const TARGET = path.resolve(__dirname, '../../vendor-app')
const BLOCKING = ['high', 'critical']

// --- collectors -----------------------------------------------------------

function dependencyScan() {
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

function sourcePattern() {
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

function lockfilePresent() {
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

const COLLECTORS = {
  dependency_scan: dependencyScan,
  source_pattern: sourcePattern,
  lockfile_present: lockfilePresent
}

// --- bundle ---------------------------------------------------------------

function collect(control) {
  const collector = COLLECTORS[control.evidence_method]
  if (!collector) throw new Error(`No collector for method: ${control.evidence_method}`)
  const { method, raw, findings } = collector()
  return {
    control_id: control.id,
    target: 'vendorco-api',
    method,
    collected_at: new Date().toISOString(),
    findings,
    blocking: findings.filter(f => BLOCKING.includes(f.severity)).length,
    raw_digest: createHash('sha256').update(raw).digest('hex')
  }
}

module.exports = { collect, BLOCKING }
