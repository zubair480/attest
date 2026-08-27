# Demo

Everything below is captured output from a real run, not written by hand.

Reproduce it: `npm install --prefix vendor-app`, `npm install --prefix vendor2-app`,
then `npm run judge` (no keys, offline) or `npm run dual` (both gates, both vendors).
`npm run ui` opens the bank's console at localhost:4173.

The `quota spent` rows are honest: the Runtype trial key allows 50 calls a day and
they are spent. Those controls fall back to the counter alone, which is the documented
degradation. Judgments already made are cached on the evidence digest and still shown.

## 1. Both gates, five controls, two vendors

```
Runtype relevance judge: enabled

VendorCo  (vendorco-api)
control  severity-counter  relevance-judge   outcome
-------  ----------------  ----------------  --------
DEP-01   REFUTED           REFUTED           REFUTED
INP-01   REFUTED           REFUTED           REFUTED
SCM-01   SUPPORTED         SUPPORTED         SUPPORTED
SEC-01   SUPPORTED         quota spent       SUPPORTED
ACC-01   REFUTED           INSUFFICIENT      ESCALATED
         Gates disagree: deterministic says REFUTED, relevance judge says INSUFFICIENT. Neither overrides the other; a person decides.

Northwind Systems  (northwind-api)
control  severity-counter  relevance-judge   outcome
-------  ----------------  ----------------  --------
DEP-01   SUPPORTED         quota spent       SUPPORTED
INP-01   SUPPORTED         quota spent       SUPPORTED
SCM-01   SUPPORTED         quota spent       SUPPORTED
SEC-01   REFUTED           quota spent       REFUTED
ACC-01   SUPPORTED         INSUFFICIENT      ESCALATED
         Gates disagree: deterministic says SUPPORTED, relevance judge says INSUFFICIENT. Neither overrides the other; a person decides.

10 assessments across 2 vendor(s): 3 held, 5 accepted, 2 escalated.

5 control(s) went unjudged: the Runtype trial key allows 50 calls a day
and they are spent. Those rows fall back to the counter alone, which is the
documented degradation -- and exactly the blind spot the escalations above show.

The counter would have PASSED northwind/ACC-01 on evidence
that cannot answer the question. A false pass is the expensive kind: it clears
a control nobody actually checked. Only the relevance gate caught it.
```

**ACC-01 is the point, and it lands twice.** It asks whether production access is
restricted with MFA, and it is answered with a dependency scan. The counter
refuses VendorCo because that supplier happens to have dependency findings, and
**clears Northwind** because that one happens not to. Neither fact says anything
about access control.

A false refusal costs a vendor a deal. A false pass clears a control nobody
checked. One gate produces both; only the relevance judge catches either.

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
