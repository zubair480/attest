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
const { collect, vendors } = require('./evidence')
const { evaluate, receipt } = require('./evaluate')
const { secondOpinion, reconcile } = require('./judge')

const CHANNEL = process.env.ATTEST_CHANNEL || 'team.attest'
const DRY = process.argv.includes('--dry')

// exchange.js [vendor_id] [--dry]
const wanted = process.argv.slice(2).find(a => !a.startsWith('--'))
const vendor = vendors.find(v => v.id === (wanted || vendors[0].id))
if (!vendor) {
  console.error(`Unknown vendor ${wanted}. Known: ${vendors.map(v => v.id).join(', ')}`)
  process.exit(2)
}

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

// The channel is the record a reader sees, so both gates have to speak on it.
// Posting only the counter would put a false pass on the transcript.
async function main() {
say('attest', `Assessment opened against ${vendor.name}. ${controls.length} controls, target ${vendor.service}.`)

for (const control of controls) {
  say('bank', `${control.id} — ${control.question}`)

  const answer = control.vendor_position
  const evidence = collect(control, vendor.id)
  say('vendor', `${control.id} — ${vendor.name} position is "${answer}". Evidence attached: ${evidence.method}, ` +
    `${evidence.findings.length} findings (${evidence.blocking} blocking), sha256 ${evidence.raw_digest.slice(0, 12)}.`)

  const result = evaluate(control, answer, evidence)
  const llm = await secondOpinion(control, answer, evidence)
  const second = reconcile(result.verdict, llm)
  const r = { ...receipt(control, answer, evidence, result), ...second }
  receipts.push(r)

  if (second.outcome === 'ESCALATED') {
    say('bank', `${control.id} — ESCALATED. Severity counter says ${result.verdict}, ` +
      `relevance judge says ${second.second_opinion}. ${second.reason || ''} ` +
      `Neither overrides the other, so nothing is recorded and a person decides.`)
  } else if (result.verdict === 'SUPPORTED') {
    say('bank', `${control.id} — ACCEPTED. ${r.reason}` +
      (second.second_opinion ? ` Relevance judge: ${second.second_opinion}.` : ''))
  } else {
    say('bank', `${control.id} — HELD (${result.verdict}). ${r.reason}` +
      (r.citations && r.citations.length ? ` Cited: ${r.citations[0]}` : ''))
  }
}

const held = receipts.filter(r => r.outcome === 'REFUTED').length
const esc = receipts.filter(r => r.outcome === 'ESCALATED').length
say('attest', `Assessment closed for ${vendor.name}. ${receipts.length} answered, ${held} held, ${esc} escalated. ` +
  `A held control is not a rejected vendor; it is an answer that did not survive its own evidence. ` +
  `An escalated one is an answer neither gate could settle.`)

require('node:fs').writeFileSync(
  require('node:path').resolve(__dirname, `../receipts-${vendor.id}.json`),
  JSON.stringify(receipts, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
