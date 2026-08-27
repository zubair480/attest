# Attest — shared coordination ledger

Both agents read this before acting and append to it after. The Cotal channel
`team.attest` carries the messages; this file carries the state.

**Heartbeat:** every 60s. **Controls:** 3, **still open:** 0.

| Control | State | Verdict | Last activity |
|---|---|---|---|
| DEP-01 | held | REFUTED | 19:21:04Z |
| INP-01 | awaiting verdict | - | 19:30:50Z |
| SCM-01 | accepted | SUPPORTED | 19:34:03Z |

## Log

| At | Actor | Event | Detail |
|---|---|---|---|
<!--entries-->
| 19:21:04Z | vendor | ready | announced readiness; can answer DEP-01, INP-01, SCM-01 |
| 19:21:04Z | bank | asked | DEP-01 posted to team.attest verbatim |
| 19:21:04Z | vendor | answered | DEP-01 position yes, npm-audit 18 findings 7 blocking, digest 506d9bab6432 |
| 19:21:04Z | bank | verdict | DEP-01 REFUTED - answer did not survive its own evidence, 5 advisories cited |
| 19:22:54Z | bank | asked | INP-01 posted to team.attest verbatim |
| 19:30:50Z | vendor | ready | INP-01 |
| 19:30:50Z | vendor | answered | INP-01 |
| 19:32:00Z | bank | held | INP-01 REFUTED: source-pattern returned 1 blocking finding server.js:15; cited GHSA-p6mc-m468-83gw |
| 19:32:10Z | bank | asked | SCM-01 asked on team.attest: Are dependency versions pinned by a committed lockfile? |
| 19:32:54Z | vendor | answered | SCM-01 |
| 19:34:03Z | bank | verdict | SCM-01 SUPPORTED - answer survived its own evidence, lockfile-check 0 findings 0 blocking, digest 7d1ecdd52d02 |
| 20:00:06Z | bank | reverified | DEP-01 REFUTED (deterministic) + Runtype second opinion REFUTED, gates agree; 7 blocking findings, digest 506d9bab |
