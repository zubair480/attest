// Attest console. Zero dependencies, no build step.
//
// The page is not a picture of a previous run. Pressing Run executes the same
// collectors and the same two gates the CLI uses, on this machine, now. If the
// vendor app changes, the verdicts change with it.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const controls = require(path.join(ROOT, 'attest/controls.json'))
const { collect } = require(path.join(ROOT, 'attest/src/evidence'))
const { evaluate, receipt } = require(path.join(ROOT, 'attest/src/evaluate'))
const { secondOpinion, reconcile, available } = require(path.join(ROOT, 'attest/src/judge'))

const PORT = process.env.PORT || 4173

async function runOne(control) {
  const evidence = collect(control)
  const det = evaluate(control, control.vendor_position, evidence)
  const llm = await secondOpinion(control, control.vendor_position, evidence)
  const r = reconcile(det.verdict, llm)
  return {
    ...receipt(control, control.vendor_position, evidence, det),
    counter: det.verdict,
    judge: r.second_opinion,
    judge_reason: r.reason || null,
    outcome: r.outcome,
    escalation: r.escalation || null,
    findings: evidence.findings.slice(0, 8)
  }
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

http.createServer(async (req, res) => {
  try {
    if (req.url === '/') return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), 'text/html; charset=utf-8')
    if (req.url === '/api/meta') return send(res, 200, { controls, judge: available() })
    if (req.url === '/api/ledger') {
      const md = fs.existsSync(path.join(ROOT, 'LEDGER.md')) ? fs.readFileSync(path.join(ROOT, 'LEDGER.md'), 'utf8') : ''
      const start = md.indexOf('| Control |')
      return send(res, 200, { table: start === -1 ? '' : md.slice(start, md.indexOf('## Log')).trim() })
    }
    if (req.url.startsWith('/api/run')) {
      const id = new URL(req.url, 'http://x').searchParams.get('control')
      const target = id ? controls.filter(c => c.id === id) : controls
      const out = []
      for (const c of target) out.push(await runOne(c))
      return send(res, 200, out)
    }
    send(res, 404, { error: 'not found' })
  } catch (err) {
    send(res, 500, { error: String(err && err.message || err) })
  }
}).listen(PORT, () => console.log(`attest console -> http://localhost:${PORT}`))
