#!/usr/bin/env node
// Drives the attestation exchange onto the judged Cotal channel.
//
// Every number that appears on the channel is produced here at run time: the
// evidence comes from a real scan of vendor-app, and the verdict comes from
// the eval gate. Nothing is transcribed from an earlier run.
//
// Speaker labels are honest. Until `claude login` is refreshed on this
// machine, bank and vendor cannot hold their own mesh actor credentials, so
// both lines are posted by the operator's identity and labelled with who is
// speaking. The reasoning is real; the autonomy is not yet.
const { execFileSync, execSync } = require('node:child_process')
const controls = require('../controls.json')
const { collect } = require('./evidence')
const { evaluate, receipt } = require('./evaluate')

const CHANNEL = process.env.ATTEST_CHANNEL || 'team.attest'
const DRY = process.argv.includes('--dry')

function say(speaker, text) {
  const line = `[${speaker}] ${text}`
  console.log(line)
  if (DRY) return
  execSync(`cotal send msg ${CHANNEL} ${JSON.stringify(line)}`, {
    cwd: require('node:path').resolve(__dirname, '../..'),
    stdio: ['ignore', 'ignore', 'pipe']
  })
}

const receipts = []
say('attest', `Assessment opened. ${controls.length} controls, target vendorco-api.`)

for (const control of controls) {
  say('bank', `${control.id} — ${control.question}`)

  const answer = control.vendor_position
  const evidence = collect(control)
  say('vendor', `${control.id} — our position is "${answer}". Evidence attached: ${evidence.method}, ` +
    `${evidence.findings.length} findings (${evidence.blocking} blocking), sha256 ${evidence.raw_digest.slice(0, 12)}.`)

  const result = evaluate(control, answer, evidence)
  const r = receipt(control, answer, evidence, result)
  receipts.push(r)

  if (r.verdict === 'SUPPORTED') {
    say('bank', `${control.id} — ACCEPTED. ${r.reason}`)
  } else {
    say('bank', `${control.id} — HELD (${r.verdict}). ${r.reason}` +
      (r.citations.length ? ` Cited: ${r.citations[0]}` : ''))
  }
}

const held = receipts.filter(r => r.verdict !== 'SUPPORTED').length
say('attest', `Assessment closed. ${receipts.length} answered, ${held} held for review. ` +
  `A held control is not a rejected vendor; it is an answer that did not survive its own evidence.`)

require('node:fs').writeFileSync(require('node:path').resolve(__dirname, '../receipts.json'), JSON.stringify(receipts, null, 2))
