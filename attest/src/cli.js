#!/usr/bin/env node
// The tool surface both agents call. The vendor agent collects; the bank
// agent evaluates. Everything is JSON on stdout so an agent can pipe it
// straight into a mesh message without reformatting.
const fs = require('node:fs')
const controls = require('../controls.json')
const { collect } = require('./evidence')
const { evaluate, receipt } = require('./evaluate')
const ledger = require('./ledger')

const [, , cmd, ...rest] = process.argv

function findControl(id) {
  const c = controls.find(c => c.id === id)
  if (!c) {
    console.error(`Unknown control ${id}. Known: ${controls.map(c => c.id).join(', ')}`)
    process.exit(2)
  }
  return c
}

function out(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n') }

switch (cmd) {
  case 'controls':
    out(controls.map(({ id, question, evidence_method }) => ({ id, question, evidence_method })))
    break

  case 'collect': {
    // vendor side: produce evidence for one control
    out(collect(findControl(rest[0])))
    break
  }

  case 'evaluate': {
    // bank side: evaluate <control_id> <answer> <evidence.json|-> [--second-opinion]
    // With --second-opinion the receipt also carries the Runtype judge's
    // independent verdict and whether the two agree. The deterministic verdict
    // is never replaced by it.
    const args = rest.filter(a => a !== '--second-opinion')
    const wantSecond = rest.includes('--second-opinion')
    const [id, answer, file] = args
    const control = findControl(id)
    const src = file === '-' || !file ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8')
    const evidence = JSON.parse(src)
    const result = evaluate(control, answer, evidence)
    const r = receipt(control, answer, evidence, result)
    if (!wantSecond) { out(r); break }
    const { secondOpinion, reconcile } = require('./judge')
    secondOpinion(control, answer, evidence)
      .then(llm => out({ ...r, ...reconcile(result.verdict, llm) }))
      .catch(err => out({ ...r, second_opinion: 'error', detail: String(err && err.message || err) }))
    break
  }

  case 'ledger':
    // read shared state: what is settled, what is still open
    out(ledger.status())
    break

  case 'ledger-log': {
    // append one line of shared state: ledger-log <actor> <event> <detail...>
    const [actor, event, ...detail] = rest
    if (!actor || !event) { console.error('usage: ledger-log <actor> <event> <detail...>'); process.exit(2) }
    out({ entries: ledger.append(actor, event, detail.join(' ')) })
    break
  }

  default:
    console.error(`usage:
  node src/cli.js controls
  node src/cli.js collect <control_id>
  node src/cli.js evaluate <control_id> <yes|no> <evidence.json|-> [--second-opinion]
  node src/cli.js ledger
  node src/cli.js ledger-log <actor> <event> <detail...>`)
    process.exit(2)
}
