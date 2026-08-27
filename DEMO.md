# Demo

Everything below is captured output from a real run, not written by hand.
Reproduce it yourself: `npm install` in `vendor-app/`, then `npm run judge`
(no keys needed) or `npm run dual` (needs a Runtype key for the second gate).

## 1. Both gates, four controls

```
Runtype relevance judge: enabled

control  severity-count   relevance-judge   outcome
-------  ---------------  ----------------  --------
DEP-01   REFUTED          REFUTED           REFUTED
         judge: The npm audit evidence shows multiple high severity vulnerabilities in production dependencies such as body-parser and lodash.
INP-01   REFUTED          REFUTED           REFUTED
         judge: The evidence identifies a high-severity vulnerability where unvalidated request body input is merged directly into application objects.
SCM-01   SUPPORTED        SUPPORTED         SUPPORTED
         judge: The lockfile check produced no findings, supporting the vendor's claim that dependency versions are pinned.
ACC-01   REFUTED          INSUFFICIENT      ESCALATED
         Gates disagree: deterministic says REFUTED, relevance judge says INSUFFICIENT. Neither overrides the other; a person decides.
         judge: The provided npm audit vulnerability findings do not evaluate or provide evidence regarding production access control or multi-factor authentication.

4 controls. 2 held, 1 accepted, 1 escalated.

Escalated: ACC-01. The severity counter refuted these; the
relevance judge found the evidence could not answer the question at all.
A counter alone would have recorded a refusal it had no grounds for.
```

**ACC-01 is the point.** It asks whether production access is restricted to
named individuals with MFA, and it is answered with a dependency scan — the
wrong instrument entirely. The severity counter sees seven blocking findings and
refutes. The relevance judge refuses to conclude anything, because npm audit
output cannot speak to access control.

A counter alone would have recorded a confident refusal it had no grounds for.
That is a false negative against the vendor, and no amount of counting catches
it. Neither gate overrides the other, so the control escalates and nothing is
recorded.

## 2. A receipt

Every decision emits one. This is INP-01, unedited:

```json
{
  "control_id": "INP-01",
  "framework": "SIG/CAIQ",
  "question": "Is untrusted user input validated before being merged into application objects?",
  "vendor_answer": "yes",
  "evidence_method": "source-pattern",
  "evidence_digest": "5ecc69af662ed393e654d6866dc2fdedb626633f97b6cce4ee77f025eb3e2113",
  "findings_total": 1,
  "findings_blocking": 1,
  "verdict": "REFUTED",
  "reason": "The source code analysis found untrusted request body data being merged directly into objects without validation, introducing a prototype pollution vulnerability.",
  "citations": [
    "https://github.com/advisories/GHSA-p6mc-m468-83gw"
  ],
  "decided_at": "2026-08-27T20:57:21.236Z",
  "second_opinion": "REFUTED",
  "agrees": true,
  "outcome": "REFUTED"
}
```

`evidence_digest` is a sha256 of the raw collector output. It binds the bundle
to what was delivered — see "What this does not solve" in the README for what
it does *not* prove.

## 3. Two agents, on the mesh

`bank` and `vendor` are separate Cotal agents with separate mesh actor
credentials, spawned from the persona files in `.cotal/agents/`. From the
`team.attest` channel, verbatim:

> **bank** — DEP-01. Are your production dependencies free of known high or
> critical severity vulnerabilities?

> **vendor** — DEP-01. VendorCo position: yes. Evidence (npm-audit), unedited:
> 18 findings, 7 blocking, digest `506d9bab6432`.

> **bank** — DEP-01 HELD (REFUTED). Vendor answered "yes", but its own audit
> returned 7 blocking findings in body-parser, lodash and path-to-regexp. The
> answer did not survive its own evidence.

Nobody scripted those. The vendor attached the findings that destroy its own
answer because its persona says deciding what the evidence means is not its
job. Its own words when it did so:

> "That contradiction is the bank's to weigh, not mine to hide."

## 4. Shared state

Agents read `LEDGER.md` before acting to see what is still open, so neither
redoes finished work. The mesh carries the messages; the ledger carries the
state.

| Control | State | Verdict | Last activity |
|---|---|---|---|
| DEP-01 | held | REFUTED | 19:21:04Z |
| INP-01 | awaiting verdict | - | 19:30:50Z |
| SCM-01 | accepted | SUPPORTED | 19:34:03Z |

## What a judge can trigger

```
npm run judge     four controls, deterministic gate only, no keys, no network
npm run dual      both gates, needs a Runtype key
npm run ledger    shared coordination state
npm run demo      the two-party exchange as a transcript
```
