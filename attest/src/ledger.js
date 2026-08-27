// Shared coordination ledger.
//
// LEDGER.md is the state both agents read before acting and append to after.
// It answers "what has already been done, and by whom" without either agent
// having to replay the whole channel.
//
// It is deliberately NOT the transport. Messages between the bank and the
// vendor cross the Cotal mesh, because those two are different organisations
// and a shared file assumes one filesystem. The ledger is the shared *state*;
// the mesh is the shared *boundary*. Collapsing the two would delete the
// cross-organisation property that makes this worth building.
const fs = require('node:fs')
const path = require('node:path')

const LEDGER = path.resolve(__dirname, '../../LEDGER.md')
const MARK = '<!--entries-->'
const controls = require('../controls.json')

function readEntries() {
  if (!fs.existsSync(LEDGER)) return []
  const body = fs.readFileSync(LEDGER, 'utf8')
  const start = body.indexOf(MARK)
  if (start === -1) return []
  const raw = body.slice(start + MARK.length).trim()
  if (!raw) return []
  return raw.split(/\r?\n/).filter(Boolean).map(line => {
    const cells = line.split('|').map(c => c.trim())
    if (cells[0] === '') cells.shift()
    if (cells[cells.length - 1] === '') cells.pop()
    const [at, actor, event, ...rest] = cells
    return { at, actor, event, detail: rest.join(' | ') }
  })
}

// One tolerant reading of "was this control decided", shared by render() and
// status(). Agents pick their own event word, so a decision is anything
// carrying a verdict token or an event that plainly names an outcome. Both
// views call this, so they can never disagree about what is settled -- which
// is exactly the bug this replaced.
function decisionOf(e) {
  const token = (e.detail || '').match(/(SUPPORTED|REFUTED|INSUFFICIENT)/)
  if (token) return token[1]
  const byWord = { held: 'REFUTED', refuted: 'REFUTED', accepted: 'SUPPORTED', supported: 'SUPPORTED' }
  return byWord[e.event] || null
}

function controlOf(e) {
  const m = (e.detail || '').match(/\b([A-Z]{3}-\d{2})\b/)
  return m ? m[1] : null
}

function render(entries) {
  const byControl = new Map()
  for (const e of entries) {
    const id = controlOf(e)
    if (!id) continue
    const c = byControl.get(id) || {}
    const v = decisionOf(e)
    if (e.event === 'asked') c.asked = e.at
    if (e.event === 'answered') c.answered = e.at
    if (v) { c.verdict = v; c.decided = e.at }
    byControl.set(id, c)
  }
  const rows = controls.map(ctl => {
    const s = byControl.get(ctl.id) || {}
    const state = s.verdict ? (s.verdict === 'SUPPORTED' ? 'accepted' : 'held')
      : s.answered ? 'awaiting verdict' : s.asked ? 'awaiting answer' : 'open'
    return `| ${ctl.id} | ${state} | ${s.verdict || '-'} | ${s.decided || s.answered || s.asked || '-'} |`
  })
  const unsettled = controls.filter(ctl => !(byControl.get(ctl.id) || {}).verdict).length

  return [
    '# Attest — shared coordination ledger',
    '',
    'Both agents read this before acting and append to it after. The Cotal',
    'channel `team.attest` carries the messages between the two organisations;',
    'this file carries the state they share.',
    '',
    `**Heartbeat:** every 60s. **Controls:** ${controls.length}, **unsettled:** ${unsettled}.`,
    '',
    '| Control | State | Verdict | Last activity |',
    '|---|---|---|---|',
    rows.join('\n'),
    '',
    '## Log',
    '',
    '| At | Actor | Event | Detail |',
    '|---|---|---|---|',
    MARK,
    entries.map(e => `| ${e.at} | ${e.actor} | ${e.event} | ${e.detail} |`).join('\n'),
    ''
  ].join('\n')
}

function append(actor, event, detail) {
  const entries = readEntries()
  entries.push({ at: new Date().toISOString().slice(11, 19) + 'Z', actor, event, detail })
  fs.writeFileSync(LEDGER, render(entries))
  return entries.length
}

function refresh() { fs.writeFileSync(LEDGER, render(readEntries())) }

function status() {
  const entries = readEntries()
  const settled = new Set(entries.filter(decisionOf).map(controlOf).filter(Boolean))
  return {
    entries: entries.length,
    settled: [...settled],
    open: controls.map(c => c.id).filter(id => !settled.has(id))
  }
}

if (require.main === module) {
  if (process.argv.includes('--watch')) {
    const tick = () => {
      refresh()
      const s = status()
      console.log(`[${new Date().toISOString().slice(11, 19)}Z] ledger heartbeat - ${s.entries} entries, settled: ${s.settled.join(',') || 'none'}, open: ${s.open.join(',') || 'none'}`)
    }
    tick()
    setInterval(tick, 60_000)
  } else {
    console.log(JSON.stringify(status(), null, 2))
  }
}

module.exports = { append, status, refresh, readEntries, LEDGER }
