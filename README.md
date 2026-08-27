# Attest

**A bank's agent asks a vendor's agent a security question. The answer does not
count until the evidence backs it.**

SOC 2 is a photograph taken eleven months ago. This is a live answer the asker
can verify instead of trust.

## Run it (no setup, no keys)

    npm install --prefix vendor-app
    npm install --prefix vendor2-app
    npm run judge          # deterministic gate, offline, no keys
    npm run dual           # both gates, across both vendors
    npm run ui             # the bank's console at localhost:4173

`npm run judge` needs nothing but Node. `npm run dual` and the console use a
Runtype key for the second gate if one is present, and say so plainly if not.

## What happens

1. **bank** asks one control question.
2. **vendor** answers with its own position and attaches evidence it produced
   about a system it owns (`vendor-app/`).
3. **bank** runs an eval gate: does this evidence support this claim?
4. Unsupported claims are **held**, never recorded as answers.
5. Every decision emits a receipt: claim, method, sha256 of the raw output,
   verdict, citations.

Current run: **3 controls, 2 held, 1 accepted.**

## Two vendors, because a bank has a portfolio

The same five controls run against two suppliers with opposite risk profiles.
Both answer "yes" to everything.

| Control | VendorCo | Northwind Systems |
|---|---|---|
| DEP-01 dependencies free of high/critical CVEs | **held** — 7 blocking | accepted — 0 blocking |
| INP-01 input validated before object merge | **held** — `server.js:15` | accepted |
| SCM-01 versions pinned by lockfile | accepted | accepted |
| SEC-01 credentials kept out of source | accepted | **held** — credential at `server.js:19` |
| ACC-01 production access restricted with MFA | **escalated** | **escalated** |

Two vendors, two completely different failures. That is the whole reason third
party risk is a portfolio problem rather than a questionnaire.

## The gate is doubled, and ACC-01 is why

- **Severity counter** (`attest/src/evaluate.js`) counts blocking findings.
  Deterministic, offline, cannot be argued out of a finding. It has no way to
  know whether a finding is *relevant* to the control that was asked.
- **Relevance judge** (`attest/src/judge.js`, a Runtype agent) is asked one
  question only: can this evidence answer this control at all?

ACC-01 asks whether production access is restricted with MFA, and is answered
with a dependency scan — the wrong instrument. Watch what the counter does:

| Vendor | Severity counter | Relevance judge | Outcome |
|---|---|---|---|
| VendorCo | REFUTED | INSUFFICIENT | escalated |
| Northwind | **SUPPORTED** | INSUFFICIENT | escalated |

**The counter is wrong in both directions on the same control.** It refuses
VendorCo because that vendor happens to have dependency findings, and it clears
Northwind because that vendor happens not to — neither of which says anything
about access control. The judge's answer for both:

> "The provided npm audit evidence assesses software dependencies and cannot
> speak to production access controls or multi-factor authentication."

A false refusal costs a vendor a deal. **A false pass clears a control nobody
checked**, and the bank finds out during an incident. One gate produces both.

**Disagreement is an outcome.** Neither gate overrides the other; a split
escalates and nothing is recorded, because that is the case a person should
read. Delete `.runtype-key` and the counter carries on alone, with the blind
spot back.

## Judgments are cached on the evidence digest

A judgment is a function of the evidence, and every bundle carries a sha256. Identical
evidence, identical verdict — so re-asking costs a call and buys nothing. The digest is
the cache key, which means the cache invalidates itself the moment a vendor's system
changes. Controls with no cached judgment and no quota report that plainly rather
than guessing.

## Evidence is pluggable, and says what it is

Four collectors, each answering a different kind of question:

| Method | What it does |
|---|---|
| `npm-audit` | Runs `npm audit` against the vendor's tree and reads published advisories |
| `source-pattern` | Matches prototype-pollution sinks reachable from request data |
| `lockfile-check` | Checks for a committed lockfile |
| `secret-scan` | Matches hardcoded credential assignments |

Adding a control means writing a collector. **The verdict rule never changes** —
that split is why a new control never touches the gate.

Collectors take the vendor they are assessing, so the same control set runs
against any supplier and each bundle records which system was actually looked
at. Every bundle also records which producer ran, so a substituted method is
visible rather than hidden: Hacker Bob's local runtime is the intended producer
for the scan methods, and `npm audit` stands in, labelled as such.

## It actually runs between two agents

`bank` and `vendor` are separate Cotal agents holding separate mesh actor
credentials (`u_...bank`, `u_...vendor`), spawned from the persona files in
`.cotal/agents/`. A full assessment, recorded on `team.attest`:

| Control | Vendor said | Evidence | Verdict |
|---|---|---|---|
| DEP-01 | yes | npm-audit: 18 findings, 7 blocking | **HELD** (REFUTED, 5 advisories) |
| INP-01 | yes | source-pattern: `server.js:15` | **HELD** (REFUTED) |
| SCM-01 | yes | lockfile-check: 0 blocking | **ACCEPTED** (SUPPORTED) |

Nobody scripted those messages. Each agent read the shared ledger to see what
was still open, picked its next control, and acted. The vendor attached the
findings that contradict its own answers because its persona tells it that
deciding what the evidence means is not its job. In its own words:

> "That contradiction is the bank's to weigh, not mine to hide."

SCM-01 matters as much as the two refusals: the gate says yes when the evidence
earns it. A gate that only ever refuses is a rule, not a judge.

## Coordination vs. state

Two different jobs, deliberately not collapsed into one:

- **Cotal mesh** — coordination. Messages between two organisations, each agent
  under its own actor credential. This is the boundary.
- **`LEDGER.md`** — shared state. What is settled, what is open, who did what.
  Both agents read it before acting so neither redoes finished work, and a 60s
  heartbeat keeps the summary current (`npm run heartbeat`).

A shared file assumes one filesystem, which means one machine and one
organisation. Using it as the transport would delete the cross-org property
entirely, so it holds state only.

## What this does not solve

**The evidence is vendor-produced, and nothing here proves it is real.** The
sha256 in every receipt binds the bundle to what was delivered; it says nothing
about whether the vendor's collector actually ran. A vendor agent could return
fabricated findings and both gates would reason faithfully over a lie.

That is a real hole in a product about not trusting claims, and it is worth
being precise about what it does and does not undermine:

- It does not undermine the **refusals**. A vendor that fakes evidence fakes it
  *in its own favour*. DEP-01 and INP-01 are held because the vendor handed over
  findings that damage its own answer, which is not a thing a liar does.
- It does undermine the **acceptances**. SCM-01 passed on an empty finding list,
  and an empty list is exactly what a dishonest collector would return.

The honest framing is that this moves the trust boundary rather than removing
it: today a bank trusts a PDF written eleven months ago by someone the vendor
paid, and here it trusts a scan the vendor ran a moment ago and had to hand over
in full. Closing the gap properly needs attested execution — a signed collector,
a reproducible run, or a third party that re-runs the scan and compares digests.
None of that is built.

## Honest limits

- Agent sessions are one-shot per spawn, so the exchange runs as a sequence of
  spawns rather than two long-lived processes. Detached agents need a
  manager-service authority this mesh refuses (`cotal supervise` is rejected
  with a websocket error), so foreground spawn is the supported path here.
- The Runtype REST surface returns "Capability not configured". The judge agent
  itself is verified working and demos in Runtype's test panel.

## Layout

    vendor-app/              VendorCo's system: stale dependencies, a live sink
    vendor2-app/             Northwind's system: current deps, a leaked credential
    attest/vendors.json      the portfolio
    attest/controls.json     the control set
    attest/judge-cache.json  judgments, keyed by evidence digest
    attest/src/evidence.js   collectors, one per evidence method
    attest/src/evaluate.js   the severity counter and receipts
    attest/src/judge.js      the relevance judge and reconciliation
    attest/src/dual.js       both gates across the portfolio
    attest/src/exchange.js   drives the exchange onto the Cotal channel
    attest/src/ledger.js     shared coordination state
    attest/src/cli.js        the tool surface both agents call
    ui/                      the bank's console
    .cotal/agents/           bank and vendor personas
