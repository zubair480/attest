// Runs both gates over every control and reports the outcome.
//
// The point of this view is the last column. Where the gates agree, the
// deterministic verdict stands. Where they split, nothing is recorded: the
// control is escalated, because that is the case a person needs to see.
const controls = require('../controls.json')
const { collect } = require('./evidence')
const { evaluate } = require('./evaluate')
const { secondOpinion, reconcile, available } = require('./judge')

;(async () => {
  console.log(available()
    ? 'Runtype relevance judge: enabled\n'
    : 'Runtype relevance judge: no key, deterministic only\n')
  console.log('control  severity-count   relevance-judge   outcome')
  console.log('-------  ---------------  ----------------  --------')
  const rows = []
  for (const control of controls) {
    const evidence = collect(control)
    const det = evaluate(control, control.vendor_position, evidence)
    const llm = await secondOpinion(control, control.vendor_position, evidence)
    const r = reconcile(det.verdict, llm)
    rows.push({ id: control.id, det: det.verdict, llm: r.second_opinion, outcome: r.outcome, reason: r.reason })
    console.log(`${control.id}   ${String(det.verdict).padEnd(15)}  ${String(r.second_opinion).padEnd(16)}  ${r.outcome}`)
    if (r.escalation) console.log(`         ${r.escalation}`)
    if (r.reason) console.log(`         judge: ${r.reason}`)
  }
  const esc = rows.filter(r => r.outcome === 'ESCALATED')
  console.log(`\n${rows.length} controls. ${rows.filter(r => r.outcome === 'REFUTED').length} held, ` +
    `${rows.filter(r => r.outcome === 'SUPPORTED').length} accepted, ${esc.length} escalated.`)
  if (esc.length) {
    console.log(`\nEscalated: ${esc.map(r => r.id).join(', ')}. The severity counter refuted these; the`)
    console.log('relevance judge found the evidence could not answer the question at all.')
    console.log('A counter alone would have recorded a refusal it had no grounds for.')
  }
})()
