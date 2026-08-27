// Runs both gates over every control and reports where they agree.
const controls = require('../controls.json')
const { collect } = require('./evidence')
const { evaluate } = require('./evaluate')
const { secondOpinion, reconcile, available } = require('./judge')

;(async () => {
  console.log(available() ? 'Runtype second opinion: enabled\n' : 'Runtype second opinion: no key, deterministic only\n')
  for (const control of controls) {
    const evidence = collect(control)
    const det = evaluate(control, control.vendor_position, evidence)
    const llm = await secondOpinion(control, control.vendor_position, evidence)
    const r = reconcile(det.verdict, llm)
    const mark = r.agrees === true ? 'agree' : r.agrees === false ? 'DISAGREE' : r.second_opinion
    console.log(`${control.id}  deterministic=${det.verdict.padEnd(12)} runtype=${String(r.second_opinion).padEnd(12)} ${mark}`)
    if (r.reason) console.log(`         ${r.reason}`)
  }
})()
