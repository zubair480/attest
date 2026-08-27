// Attest on the edge.
//
// Workers cannot spawn a process or read a filesystem, so `npm audit` cannot
// run here. Three of the four collectors are pure string work and run live and
// unchanged; the dependency scan replays a snapshot captured on a real machine,
// and every response says which of the two it was and when it was taken. The
// alternative -- quietly presenting a replay as a live scan -- is exactly the
// dishonesty this product exists to catch.
import DATA from './data.json'
import { HTML } from './page.js'

const BLOCKING = ['high', 'critical']
const RUNTYPE = 'https://api.runtype.com/v1/products/prod_01m1287382enermwettbceza0y'
  + '/surfaces/surf_01m12873jfecev6zjmreqv0yw4/api/dispatch'

const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
})

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// --- collectors ------------------------------------------------------------

function dependencyScan(v) {
  const report = JSON.parse(v.audit_raw || '{}')
  const findings = []
  for (const [name, entry] of Object.entries(report.vulnerabilities || {})) {
    for (const via of entry.via || []) {
      if (typeof via === 'string') continue
      findings.push({
        severity: via.severity || entry.severity,
        subject: name,
        title: via.title || null,
        citation: via.url || null
      })
    }
  }
  return { method: 'npm-audit', raw: v.audit_raw || '', findings, live: false }
}

const SINKS = [
  { re: /_\.merge\s*\(\s*[^)]*req\.body/, title: 'lodash merge called directly on request body (prototype pollution sink)', citation: 'https://github.com/advisories/GHSA-p6mc-m468-83gw' },
  { re: /Object\.assign\s*\(\s*[^)]*req\.body/, title: 'Object.assign called directly on request body', citation: null }
]

const SECRETS = [
  { re: /(?:api|payment|client)?_?(?:secret|api_key|token)\s*=\s*['"][A-Za-z0-9_]{24,}['"]/i, title: 'Hardcoded credential assigned in source', citation: null },
  { re: /AKIA[0-9A-Z]{16}/, title: 'AWS access key id committed to source', citation: null },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, title: 'Private key committed to source', citation: null }
]

function matchSource(src, patterns, severity) {
  const findings = []
  for (const p of patterns) {
    const m = src.match(p.re)
    if (!m) continue
    const line = src.slice(0, m.index).split('\n').length
    findings.push({ severity, subject: 'server.js:' + line, title: p.title, citation: p.citation })
  }
  return findings
}

const COLLECTORS = {
  dependency_scan: v => dependencyScan(v),
  source_pattern: v => ({ method: 'source-pattern', raw: v.source, findings: matchSource(v.source, SINKS, 'high'), live: true }),
  secret_scan: v => ({ method: 'secret-scan', raw: v.source, findings: matchSource(v.source, SECRETS, 'critical'), live: true }),
  lockfile_present: v => ({
    method: 'lockfile-check',
    raw: v.lockfile || 'absent',
    live: true,
    findings: v.lockfile ? [] : [{ severity: 'high', subject: 'package-lock.json', title: 'No committed lockfile; dependency versions are not pinned', citation: null }]
  })
}

async function collect(control, vendorId) {
  const v = DATA.vendors[vendorId]
  const c = COLLECTORS[control.evidence_method]
  const out = c(v)
  return {
    control_id: control.id,
    vendor: vendorId,
    vendor_name: v.name,
    target: v.service,
    method: out.method,
    live: out.live,
    snapshot_at: out.live ? null : DATA.generated_at,
    findings: out.findings,
    blocking: out.findings.filter(f => BLOCKING.includes(f.severity)).length,
    raw_digest: await sha256(out.raw),
    collected_at: new Date().toISOString()
  }
}

// --- gates -----------------------------------------------------------------

function counter(control, answer, ev) {
  const blocking = ev.findings.filter(f => BLOCKING.includes(f.severity))
  const citations = [...new Set(blocking.map(f => f.citation).filter(Boolean))].slice(0, 5)
  if (answer !== 'yes') {
    return { verdict: 'SUPPORTED', reason: 'Vendor did not assert compliance.', citations }
  }
  if (blocking.length) {
    const where = blocking.map(f => f.subject).slice(0, 3).join(', ')
    return {
      verdict: 'REFUTED',
      reason: 'Vendor answered "yes", but its own ' + ev.method + ' returned ' + blocking.length + ' blocking finding(s): ' + where + '.',
      citations
    }
  }
  return { verdict: 'SUPPORTED', reason: 'Vendor answered "yes" and its ' + ev.method + ' returned no blocking findings.', citations: [] }
}

const JUDGE_PROMPT = 'You are the relevance judge in a third-party security assessment. You are given a control question, a vendor answer, and evidence the vendor produced. You decide ONE thing: can this evidence answer this control at all. Rules: vendor_answer "yes" plus high or critical findings that bear on the question is REFUTED. vendor_answer "yes" with no such findings is SUPPORTED. Evidence that cannot speak to the question, however real it is, is INSUFFICIENT - a dependency scan says nothing about access control. Reply with JSON only, no prose and no code fences: {"verdict":"SUPPORTED|REFUTED|INSUFFICIENT","reason":"one sentence"}'

function judgePayload(control, answer, ev) {
  return JSON.stringify({
    control_id: control.id,
    question: control.question,
    vendor_answer: answer,
    evidence: { method: ev.method, findings: ev.findings.slice(0, 8) }
  })
}

// Fallback judge. Runs inside the Worker, so it has no external quota to spend.
// It answers the same single question and its verdict is labelled with the model
// that produced it, so nobody has to guess which judge spoke.
async function workersAiJudge(control, answer, ev, env) {
  if (!env.AI) return { error: 'no AI binding' }
  const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  try {
    const res = await env.AI.run(model, {
      messages: [
        { role: 'system', content: JUDGE_PROMPT },
        { role: 'user', content: judgePayload(control, answer, ev) }
      ],
      max_tokens: 260
    })
    // Some models return the object already parsed rather than a JSON string.
    // Take it as-is when it carries a verdict; only fall through to text
    // parsing when it does not.
    const direct = res && res.response
    if (direct && typeof direct === 'object' && direct.verdict) {
      return { verdict: direct.verdict, reason: direct.reason || null, citations: [], judged_by: 'workers-ai ' + model }
    }

    // Response shapes differ by model, so read the ones that exist rather than
    // assuming one. If none match, say what came back instead of reporting a
    // bare failure nobody can act on.
    const raw = String(
      (typeof direct === 'string' ? direct : null) ??
      (res && res.result && res.result.response) ??
      (res && res.output) ??
      (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) ??
      ''
    )
    if (!raw) return { error: 'workers-ai gave no text; shape: ' + JSON.stringify(res).slice(0, 160) }
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return { error: 'workers-ai returned no json: ' + raw.slice(0, 120) }
    let parsed
    try { parsed = JSON.parse(m[0]) } catch { return { error: 'workers-ai json parse failed: ' + m[0].slice(0, 120) } }
    if (!parsed.verdict) return { error: 'workers-ai returned no verdict' }
    return { verdict: parsed.verdict, reason: parsed.reason || null, citations: [], judged_by: 'workers-ai ' + model }
  } catch (e) {
    return { error: 'workers-ai: ' + String(e && e.message || e) }
  }
}

async function runtypeJudge(control, answer, ev, env) {
  if (!env.RUNTYPE_KEY) return { error: 'no key configured' }
  try {
    const res = await fetch(RUNTYPE, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RUNTYPE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        capability: 'attest_evidence_judge_agent',
        input: {
          message: JSON.stringify({
            control_id: control.id,
            question: control.question,
            vendor_answer: answer,
            evidence: { method: ev.method, findings: ev.findings.slice(0, 8) }
          })
        }
      })
    })
    const body = await res.json()
    if (body.verdict) return { verdict: body.verdict, reason: body.reason, citations: body.citations || [], judged_by: 'runtype' }
    return { error: body.message || body.error || 'no verdict returned' }
  } catch (e) {
    return { error: String(e && e.message || e) }
  }
}

// Tiers, in order: a cached judgment for identical evidence, then Runtype, then
// Workers AI. Falling through is never silent -- the verdict carries the judge
// that produced it, and only a total failure returns an error.
async function judge(control, answer, ev, env) {
  const cached = DATA.judgeCache[control.id + ':' + ev.vendor + ':' + ev.raw_digest]
  if (cached) return Object.assign({}, cached, { from_cache: true, judged_by: cached.judged_by || 'runtype (cached)' })

  const primary = await runtypeJudge(control, answer, ev, env)
  if (primary.verdict) return primary

  const fallback = await workersAiJudge(control, answer, ev, env)
  if (fallback.verdict) return fallback

  return { error: primary.error + '; fallback: ' + fallback.error }
}

function reconcile(det, llm) {
  if (!llm) return { second_opinion: 'unavailable', outcome: det }
  if (llm.error) {
    const quota = /Limit Exceeded|daily limit|LIMIT_EXCEEDED/i.test(llm.error)
    return { second_opinion: quota ? 'quota spent' : 'error', detail: llm.error, outcome: det }
  }
  const agrees = llm.verdict === det
  return {
    second_opinion: llm.verdict,
    reason: llm.reason,
    citations: llm.citations,
    judged_by: llm.judged_by || null,
    agrees,
    outcome: agrees ? det : 'ESCALATED',
    escalation: agrees ? null : 'Gates disagree: severity counter says ' + det + ', relevance judge says ' + llm.verdict + '. Neither overrides the other; a person decides.'
  }
}

async function assess(control, vendorId, env) {
  const ev = await collect(control, vendorId)
  const det = counter(control, control.vendor_position, ev)
  const second = reconcile(det.verdict, await judge(control, control.vendor_position, ev, env))
  return {
    control_id: control.id,
    question: control.question,
    vendor: ev.vendor,
    vendor_name: ev.vendor_name,
    vendor_answer: control.vendor_position,
    evidence_method: ev.method,
    evidence_live: ev.live,
    evidence_snapshot_at: ev.snapshot_at,
    findings_total: ev.findings.length,
    findings_blocking: ev.blocking,
    evidence_digest: ev.raw_digest,
    counter: det.verdict,
    counter_reason: det.reason,
    citations: det.citations,
    judge: second.second_opinion,
    judge_reason: second.reason || null,
    judged_by: second.judged_by || null,
    judge_detail: second.detail || null,
    outcome: second.outcome,
    escalation: second.escalation || null
  }
}

// --- MCP -------------------------------------------------------------------

const TOOLS = [
  {
    name: 'attest_list_vendors',
    description: 'List the vendors in the portfolio that can be assessed.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'attest_list_controls',
    description: 'List the security controls this surface can answer.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'attest_assess',
    description: 'Run one control, or every control, against one vendor. Returns both gate verdicts, the evidence digest and the outcome. Where the two gates disagree the outcome is ESCALATED and nothing is recorded.',
    inputSchema: {
      type: 'object',
      properties: {
        vendor: { type: 'string', description: 'vendor id from attest_list_vendors' },
        control: { type: 'string', description: 'optional control id; omit to run every control' }
      },
      required: ['vendor']
    }
  }
]

const INSTRUCTIONS = 'Attest checks whether a vendor security answer is supported by the evidence attached to it. Two gates run: a severity counter, and a relevance judge that asks whether the evidence can answer the control at all. Where they disagree the control is ESCALATED and nothing is recorded, because that is the case a person should read. Start with attest_list_vendors, then attest_assess. Try ACC-01 against both vendors: the counter refuses one and clears the other on evidence that answers neither.'

async function mcp(body, env) {
  const id = body.id
  const ok = result => ({ jsonrpc: '2.0', id, result })
  const text = v => ok({ content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] })

  if (body.method === 'initialize') {
    return ok({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'attest', version: '1.0.0' },
      instructions: INSTRUCTIONS
    })
  }
  if (body.method === 'notifications/initialized') return null
  if (body.method === 'tools/list') return ok({ tools: TOOLS })
  if (body.method === 'tools/call') {
    const params = body.params || {}
    const name = params.name
    const a = params.arguments || {}
    if (name === 'attest_list_vendors') return text(DATA.vendorMeta)
    if (name === 'attest_list_controls') {
      return text(DATA.controls.map(c => ({ id: c.id, question: c.question, evidence_method: c.evidence_method })))
    }
    if (name === 'attest_assess') {
      if (!DATA.vendors[a.vendor]) {
        return text({ error: 'Unknown vendor. Known: ' + Object.keys(DATA.vendors).join(', ') })
      }
      const list = a.control ? DATA.controls.filter(c => c.id === a.control) : DATA.controls
      if (!list.length) return text({ error: 'Unknown control ' + a.control })
      const out = []
      for (const c of list) out.push(await assess(c, a.vendor, env))
      return text(out)
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown tool ' + name } }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown method ' + body.method } }
}

// --- routes ----------------------------------------------------------------

const AGENT_CARD = {
  name: 'Attest',
  description: 'Eval-gated security attestation. A vendor answers a control question and attaches evidence about its own system; two independent gates decide whether the evidence supports the answer before it is recorded.',
  mcp_endpoint: '/mcp',
  endpoints: {
    vendors: '/api/vendors',
    controls: '/api/controls',
    assess: '/api/run?vendor=<id>&control=<id>'
  },
  source: 'https://github.com/zubair480/attest',
  notes: 'Where the two gates disagree the control is ESCALATED and nothing is recorded. Evidence is vendor-produced; its digest binds the bundle, not its truth.'
}

function llmsTxt(origin) {
  return [
    '# Attest',
    '',
    '> A bank asks a vendor a security control question. The vendor answers and attaches',
    '> evidence its own agent produced. Two gates decide whether that evidence supports',
    '> the answer before it is recorded.',
    '',
    '- MCP endpoint: ' + origin + '/mcp  (attest_list_vendors, attest_list_controls, attest_assess)',
    '- Agent card:   ' + origin + '/.well-known/ai-agent.json',
    '- REST:         ' + origin + '/api/vendors, /api/controls, /api/run?vendor=<id>',
    '- Source:       https://github.com/zubair480/attest',
    '',
    'The severity counter counts blocking findings. The relevance judge asks whether the',
    'evidence can answer the control at all. Neither overrides the other: a disagreement',
    'returns ESCALATED and records nothing, because that is the case a person should read.',
    '',
    'Try ACC-01 against both vendors. The counter refuses one and clears the other on',
    'evidence that answers neither.',
    ''
  ].join('\n')
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const p = url.pathname

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS'
        }
      })
    }

    if (p === '/mcp') {
      if (req.method !== 'POST') return json({ error: 'POST JSON-RPC to this endpoint', tools: TOOLS.map(t => t.name) }, 405)
      const res = await mcp(await req.json(), env)
      return res ? json(res) : new Response(null, { status: 202 })
    }

    if (p === '/.well-known/ai-agent.json' || p === '/.well-known/agent-card.json') return json(AGENT_CARD)
    if (p === '/llms.txt') {
      return new Response(llmsTxt(url.origin), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }

    if (p === '/api/vendors') return json(DATA.vendorMeta)
    if (p === '/api/controls') return json(DATA.controls.map(c => ({ id: c.id, question: c.question, evidence_method: c.evidence_method })))
    if (p === '/api/meta') return json({ vendors: DATA.vendorMeta, controls: DATA.controls, judge: true, snapshot_at: DATA.generated_at })

    if (p === '/api/run') {
      const vendorId = url.searchParams.get('vendor') || DATA.vendorMeta[0].id
      if (!DATA.vendors[vendorId]) return json({ error: 'Unknown vendor. Known: ' + Object.keys(DATA.vendors).join(', ') }, 400)
      const cid = url.searchParams.get('control')
      const list = cid ? DATA.controls.filter(c => c.id === cid) : DATA.controls
      if (!list.length) return json({ error: 'Unknown control ' + cid }, 400)
      const out = []
      for (const c of list) out.push(await assess(c, vendorId, env))
      return json(out)
    }

    if (p === '/' || p === '/index.html') {
      return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    return json({ error: 'not found', try: ['/', '/llms.txt', '/mcp', '/api/vendors', '/api/run?vendor=vendorco'] }, 404)
  }
}
