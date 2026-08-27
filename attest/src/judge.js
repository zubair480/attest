// Second opinion: the Runtype-hosted judge.
//
// The deterministic gate in evaluate.js counts blocking severities. It is fast,
// offline, and cannot be argued out of a finding -- but it cannot tell whether
// a finding is *relevant* to the control that was asked. A dependency CVE says
// nothing about physical access control, and a counter has no way to know that.
//
// This asks a model that job, and only that job. It never overrides the
// deterministic verdict. When the two disagree, the disagreement is reported
// rather than resolved, because a silent tie-break would hide exactly the case
// a human should look at.
const fs = require('node:fs')
const path = require('node:path')

const KEY_FILE = path.resolve(__dirname, '../../.runtype-key')
const BASE = 'https://api.runtype.com/v1/products/prod_01m1287382enermwettbceza0y'
  + '/surfaces/surf_01m12873jfecev6zjmreqv0yw4/api'
const CAPABILITY = 'attest_evidence_judge_agent'

function key() {
  try { return fs.readFileSync(KEY_FILE, 'utf8').trim() } catch { return null }
}

// Returns null when unavailable. The product must keep working with no key,
// no network and no account, so this is always optional.
async function secondOpinion(control, answer, evidence, { timeoutMs = 60000, attempts = 3 } = {}) {
  const k = key()
  if (!k) return null

  const message = JSON.stringify({
    control_id: control.id,
    question: control.question,
    vendor_answer: answer,
    evidence: { method: evidence.method, findings: evidence.findings.slice(0, 8) }
  })

  // A cold model call here is slow often enough that a single attempt reports
  // "timed out" on a judge that would have answered. Retry rather than let a
  // transient timeout masquerade as a missing second opinion -- but still fail
  // honestly if it never answers, because inventing agreement is the one
  // failure this product cannot have.
  let last = 'no attempt made'
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${BASE}/dispatch`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ capability: CAPABILITY, input: { message } }),
        signal: ctrl.signal
      })
      const body = JSON.parse(await res.text())
      if (body.verdict) return { verdict: body.verdict, reason: body.reason, citations: body.citations || [], attempt: i + 1 }
      last = body.message || body.error || 'no verdict returned'
    } catch (err) {
      last = err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : err.message
    } finally {
      clearTimeout(timer)
    }
  }
  return { error: `${last} (after ${attempts} attempts)` }
}

// Agreement is the interesting field, not the second verdict on its own.
//
// Disagreement is an OUTCOME, not a footnote. The counter can refute a claim on
// evidence that cannot possibly answer it; the relevance judge can only say so.
// Neither is authoritative over the other, so a split does not get resolved
// here -- it gets escalated, because a case the two gates read differently is
// precisely the one a person should read.
function reconcile(deterministic, llm) {
  if (!llm) return { second_opinion: 'unavailable', outcome: deterministic }
  if (llm.error) return { second_opinion: 'error', detail: llm.error, outcome: deterministic }
  const agrees = llm.verdict === deterministic
  return {
    second_opinion: llm.verdict,
    reason: llm.reason,
    citations: llm.citations,
    agrees,
    outcome: agrees ? deterministic : 'ESCALATED',
    escalation: agrees ? undefined
      : `Gates disagree: deterministic says ${deterministic}, relevance judge says ${llm.verdict}. Neither overrides the other; a person decides.`
  }
}

module.exports = { secondOpinion, reconcile, available: () => !!key() }
