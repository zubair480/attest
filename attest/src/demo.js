// Local end-to-end run: bank asks, vendor answers and produces evidence,
// bank evaluates and issues a receipt. No transport yet -- this is the logic
// that Cotal will carry between two organisations.
const fs = require('node:fs')
const path = require('node:path')
const controls = require('../controls.json')
const { collect } = require('./evidence')
const { evaluate, receipt } = require('./evaluate')

const receipts = []
for (const control of controls) {
  console.log(`\n[bank]   ${control.id}  ${control.question}`)
  const answer = control.vendor_position
  const evidence = collect(control)
  console.log(`[vendor] answers "${answer}" + ${evidence.method}: ${evidence.findings.length} findings, ${evidence.blocking} blocking`)
  const result = evaluate(control, answer, evidence)
  const r = receipt(control, answer, evidence, result)
  receipts.push(r)
  const mark = r.verdict === 'SUPPORTED' ? 'PASS' : 'HELD'
  console.log(`[bank]   ${mark}  ${r.verdict}: ${r.reason}`)
  if (r.citations.length) console.log(`[bank]         cited: ${r.citations[0]}`)
}

const out = path.resolve(__dirname, '../receipts.json')
fs.writeFileSync(out, JSON.stringify(receipts, null, 2))
const held = receipts.filter(r => r.verdict !== 'SUPPORTED').length
console.log(`\n${receipts.length} controls answered, ${held} held for review. Receipts -> ${path.basename(out)}`)
