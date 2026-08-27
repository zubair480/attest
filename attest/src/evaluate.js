// The eval gate. Runs on the BANK side.
//
// A vendor's answer is a claim, not a fact. Today nobody checks it until an
// auditor does, months later. Here the claim is checked against evidence the
// vendor itself produced, at the moment it is made, and a claim the evidence
// does not support never enters the questionnaire as an answer.
//
// The rule is uniform across every control; only the evidence collector is
// control-specific. That split is deliberate: adding a new control means
// writing a collector, never touching the verdict logic.
const { BLOCKING } = require('./evidence')

const VERDICT = { SUPPORTED: 'SUPPORTED', REFUTED: 'REFUTED', INSUFFICIENT: 'INSUFFICIENT' }

function evaluate(control, answer, evidence) {
  if (!evidence || !Array.isArray(evidence.findings)) {
    return { verdict: VERDICT.INSUFFICIENT, reason: 'No evidence bundle attached to the answer.', citations: [] }
  }
  if (evidence.control_id !== control.id) {
    return { verdict: VERDICT.INSUFFICIENT, reason: `Evidence is for ${evidence.control_id}, not ${control.id}.`, citations: [] }
  }

  const blocking = evidence.findings.filter(f => BLOCKING.includes(f.severity))
  const citations = [...new Set(blocking.map(f => f.citation).filter(Boolean))].slice(0, 5)

  if (answer !== 'yes') {
    return { verdict: VERDICT.SUPPORTED, reason: 'Vendor did not assert compliance; the answer is consistent with its evidence.', citations }
  }
  if (blocking.length > 0) {
    const where = blocking.map(f => f.subject).slice(0, 3).join(', ')
    return {
      verdict: VERDICT.REFUTED,
      reason: `Vendor answered "yes", but its own ${evidence.method} returned ${blocking.length} blocking finding(s): ${where}.`,
      citations
    }
  }
  return { verdict: VERDICT.SUPPORTED, reason: `Vendor answered "yes" and its ${evidence.method} returned no blocking findings.`, citations: [] }
}

function receipt(control, answer, evidence, result) {
  return {
    control_id: control.id,
    framework: control.framework,
    question: control.question,
    vendor_answer: answer,
    evidence_method: evidence.method,
    evidence_digest: evidence.raw_digest,
    findings_total: evidence.findings.length,
    findings_blocking: evidence.blocking,
    verdict: result.verdict,
    reason: result.reason,
    citations: result.citations,
    decided_at: new Date().toISOString()
  }
}

module.exports = { evaluate, receipt, VERDICT }
