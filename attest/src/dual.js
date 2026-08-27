// Portfolio view: every control, both gates, across every vendor.
//
// A bank does not assess one supplier. Running the same control set over a
// portfolio is where the second gate earns its place, because the severity
// counter fails in opposite directions on the same control depending only on
// findings that have nothing to do with the question.
const controls = require('../controls.json')
const { collect, vendors } = require('./evidence')
const { evaluate } = require('./evaluate')
const { secondOpinion, reconcile, available } = require('./judge')

const only = process.argv[2]

;(async () => {
  console.log(available() ? 'Runtype relevance judge: enabled' : 'Runtype relevance judge: no key, counter only')
  const targets = only ? vendors.filter(v => v.id === only) : vendors
  if (!targets.length) { console.error(`Unknown vendor. Known: ${vendors.map(v => v.id).join(', ')}`); process.exit(2) }

  const all = []
  for (const v of targets) {
    console.log(`\n${v.name}  (${v.service})`)
    console.log('control  severity-counter  relevance-judge   outcome')
    console.log('-------  ----------------  ----------------  --------')
    for (const control of controls) {
      const evidence = collect(control, v.id)
      const det = evaluate(control, control.vendor_position, evidence)
      const llm = await secondOpinion(control, control.vendor_position, evidence)
      const r = reconcile(det.verdict, llm)
      all.push({ vendor: v.id, id: control.id, counter: det.verdict, judge: r.second_opinion, outcome: r.outcome })
      console.log(`${control.id}   ${String(det.verdict).padEnd(16)}  ${String(r.second_opinion).padEnd(16)}  ${r.outcome}`)
      if (r.escalation) console.log(`         ${r.escalation}`)
    }
  }

  const esc = all.filter(r => r.outcome === 'ESCALATED')
  console.log(`\n${all.length} assessments across ${targets.length} vendor(s): ` +
    `${all.filter(r => r.outcome === 'REFUTED').length} held, ` +
    `${all.filter(r => r.outcome === 'SUPPORTED').length} accepted, ${esc.length} escalated.`)

  const unjudged = all.filter(r => r.judge === 'quota spent' || r.judge === 'error')
  if (unjudged.length) {
    console.log(`
${unjudged.length} control(s) went unjudged: the Runtype trial key allows 50 calls a day`)
    console.log('and they are spent. Those rows fall back to the counter alone, which is the')
    console.log('documented degradation -- and exactly the blind spot the escalations above show.')
  }

  const split = esc.filter(r => r.counter === 'SUPPORTED')
  if (split.length) {
    console.log(`\nThe counter would have PASSED ${split.map(r => r.vendor + '/' + r.id).join(', ')} on evidence`)
    console.log('that cannot answer the question. A false pass is the expensive kind: it clears')
    console.log('a control nobody actually checked. Only the relevance gate caught it.')
  }
})()
