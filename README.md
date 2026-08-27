# Attest

**A bank's agent asks a vendor's agent a security question. The answer does not
count until the evidence backs it.**

SOC 2 is a photograph taken eleven months ago. This is a live answer the asker
can verify instead of trust.

## Run it (no setup, no keys)

    npm run judge

Scans a real target, evaluates three SIG/CAIQ controls, prints verdicts and
writes `attest/receipts.json`.

    npm run demo

The same exchange formatted as the two-party conversation, printed locally.
Drop `--dry` (`npm run demo:live`) to post it to the Cotal channel `team.attest`.

## What happens

1. **bank** asks one control question.
2. **vendor** answers with its own position and attaches evidence it produced
   about a system it owns (`vendor-app/`).
3. **bank** runs an eval gate: does this evidence support this claim?
4. Unsupported claims are **held**, never recorded as answers.
5. Every decision emits a receipt: claim, method, sha256 of the raw output,
   verdict, citations.

Current run: **3 controls, 2 held, 1 accepted.**

## The gate is doubled on purpose

    npm run dual

- **Deterministic** (`attest/src/evaluate.js`) counts blocking severities.
  Fast, offline, and cannot be argued out of a finding. It has no way to know
  whether a finding is *relevant* to the control that was asked.
- **Runtype agent** (`attest/src/judge.js`) is asked that one question, and only
  that one: does this evidence actually answer this control? A dependency CVE
  says nothing about physical access control, and a counter cannot see that.

Both gates over all three controls, run live:

| Control | Deterministic | Runtype | |
|---|---|---|---|
| DEP-01 | REFUTED | REFUTED | agree |
| INP-01 | REFUTED | REFUTED | agree |
| SCM-01 | SUPPORTED | SUPPORTED | agree |

The second opinion **never overrides** the first. When they disagree, the
disagreement is reported rather than resolved — a silent tie-break would bury
exactly the case a human should look at. And the whole thing degrades cleanly:
delete `.runtype-key` and the deterministic gate carries on alone.

## Evidence is pluggable, and says what it is

| Control | Method | Result |
|---|---|---|
| DEP-01 dependencies free of high/critical CVEs | `npm-audit` | 7 blocking → **HELD** |
| INP-01 input validated before object merge | `source-pattern` | `server.js:15` → **HELD** |
| SCM-01 versions pinned by lockfile | `lockfile-check` | 0 blocking → **ACCEPTED** |

Adding a control means writing a collector. The verdict rule never changes.

Every bundle records which producer ran, so a substituted method is visible
rather than hidden. Hacker Bob's local runtime is the intended producer for the
scan methods; `npm audit` stands in and is labelled as such.

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

## Honest limits

- Agent sessions are one-shot per spawn, so the exchange runs as a sequence of
  spawns rather than two long-lived processes. Detached agents need a
  manager-service authority this mesh refuses (`cotal supervise` is rejected
  with a websocket error), so foreground spawn is the supported path here.
- The Runtype REST surface returns "Capability not configured". The judge agent
  itself is verified working and demos in Runtype's test panel.

## Layout

    vendor-app/          the system under attestation (deliberately imperfect)
    attest/controls.json the control set
    attest/src/evidence.js   collectors, one per evidence method
    attest/src/evaluate.js   the eval gate and receipts
    attest/src/exchange.js   drives the exchange onto the Cotal channel
    attest/src/cli.js        the tool surface both agents call
