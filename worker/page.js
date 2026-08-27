// The console, served from the edge. Same shape as the local one, plus a
// per-row marker saying whether that collector ran live here or is replaying a
// snapshot taken on a real machine, because Workers cannot run npm audit.
export const HTML = String.raw`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Attest — bank console</title>
<meta name="description" content="A bank asks a vendor a security control question. The answer is not recorded until two independent gates agree the evidence supports it.">
<meta property="og:title" content="Attest">
<meta property="og:description" content="Eval-gated security attestation between agents. Two gates: one counts findings, one asks whether the evidence answers the question at all.">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b0d10'/%3E%3Cpath d='M16 4l9 3.5v8c0 5.6-3.7 10.4-9 12.5-5.3-2.1-9-6.9-9-12.5v-8L16 4z' fill='none' stroke='%237aa2ff' stroke-width='2.2' stroke-linejoin='round'/%3E%3Cpath d='M11.5 15.8l3.1 3.1 6-6.2' fill='none' stroke='%23ffc857' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<style>
  :root{--bg:#0b0d10;--line:#222a33;--fg:#e6e9ef;--mute:#8b96a5;
        --held:#ff8f6b;--ok:#6bd68a;--esc:#ffc857;--accent:#7aa2ff;--vend:#b48ef0}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);
    font:15px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:1240px;margin:0 auto;padding:34px 22px 90px}
  .scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .summary{border:1px solid var(--esc);background:rgba(255,200,87,.07);border-radius:8px;
    padding:14px 16px;margin:18px 0 4px;font-size:14px;color:#f0d9a4;display:none}
  .summary b{color:var(--fg)}
  @media (max-width:820px){
    .wrap{padding:24px 14px 70px}
    table,thead,tbody,tr,td,th{display:block}
    thead{display:none}
    tr{border:1px solid var(--line);border-radius:8px;margin-bottom:12px;padding:4px 0}
    td{border-top:0;padding:9px 13px}
    td:before{content:attr(data-l);display:block;font:10px ui-monospace,monospace;
      letter-spacing:.09em;text-transform:uppercase;color:var(--mute);margin-bottom:3px}
  }
  h1{font-size:25px;margin:0 0 5px;letter-spacing:-.02em}
  .sub{color:var(--mute);margin:0 0 8px;max-width:72ch}
  .seat{display:inline-block;font:11px ui-monospace,monospace;letter-spacing:.08em;
    text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);
    border-radius:4px;padding:3px 8px;margin-bottom:16px}
  .tabs{display:flex;gap:8px;margin:16px 0 6px;flex-wrap:wrap}
  .tab{background:transparent;border:1px solid var(--line);color:var(--mute);
    border-radius:7px;padding:9px 15px;font-size:14px;cursor:pointer}
  .tab.on{border-color:var(--vend);color:var(--fg);background:rgba(180,142,240,.09)}
  .bar{display:flex;gap:11px;align-items:center;flex-wrap:wrap;margin:14px 0 20px}
  button.go{background:var(--accent);color:#0b0d10;border:0;border-radius:7px;
    padding:11px 20px;font-weight:650;font-size:15px;cursor:pointer}
  button.go:disabled{opacity:.5;cursor:default}
  .pill{font:12px ui-monospace,monospace;color:var(--mute);
    border:1px solid var(--line);border-radius:999px;padding:5px 11px}
  a{color:var(--accent)}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;font:11px ui-monospace,monospace;letter-spacing:.09em;
     text-transform:uppercase;color:var(--mute);padding:0 12px 9px;font-weight:600}
  td{border-top:1px solid var(--line);padding:14px 12px;vertical-align:top}
  tr[data-out="ESCALATED"]{background:rgba(255,200,87,.07)}
  .id{font:13px ui-monospace,monospace}
  .q{color:var(--mute);font-size:13px;margin-top:3px;max-width:40ch}
  .from{color:var(--vend);font:11px ui-monospace,monospace;letter-spacing:.04em}
  .ev{font-size:13px;margin-top:4px}
  .dig{font:11px ui-monospace,monospace;color:var(--mute);margin-top:4px}
  .tag{font:10px ui-monospace,monospace;border:1px solid var(--line);border-radius:3px;
    padding:1px 5px;margin-left:6px;color:var(--mute)}
  .v{font:12px ui-monospace,monospace;font-weight:700}
  .REFUTED{color:var(--held)} .SUPPORTED{color:var(--ok)}
  .INSUFFICIENT,.ESCALATED{color:var(--esc)}
  .why{color:var(--mute);font-size:13px;margin-top:6px;max-width:52ch}
  .note{border-left:2px solid var(--esc);padding:9px 0 9px 13px;margin-top:9px;
    color:#f0d9a4;font-size:13px;max-width:52ch}
  .empty{color:var(--mute);padding:26px 12px;font-size:14px}
  footer{margin-top:30px;color:var(--mute);font-size:13px;max-width:82ch}
  .spin{display:inline-block;width:12px;height:12px;border:2px solid var(--line);
    border-top-color:var(--accent);border-radius:50%;animation:s .7s linear infinite;
    vertical-align:-2px;margin-right:7px}
  @keyframes s{to{transform:rotate(360deg)}}
</style>
<div class="wrap">
  <span class="seat">bank &middot; third-party risk</span>
  <h1>Attest</h1>
  <p class="sub">This is the bank's seat. The bank never touches the vendor's systems &mdash; it asks
  a control question, the vendor's own agent runs the collector on its own infrastructure and hands
  back evidence, and two gates decide whether that evidence supports the answer.</p>
  <p class="sub">Agents welcome: <a href="/llms.txt">/llms.txt</a> &middot;
  <a href="/.well-known/ai-agent.json">agent card</a> &middot; MCP at <code>/mcp</code> &middot;
  <a href="https://github.com/zubair480/attest">source</a></p>

  <div class="tabs" id="tabs"></div>
  <div class="bar">
    <button class="go" id="run">Request attestation</button>
    <span class="pill" id="snap">&hellip;</span>
    <span class="pill" id="status">idle</span>
  </div>

  <div class="summary" id="summary"></div>

  <div class="scroll"><table>
    <thead><tr>
      <th style="width:23%">Control (bank asks)</th>
      <th style="width:30%">Evidence returned by vendor</th>
      <th style="width:12%">Severity counter</th>
      <th style="width:12%">Relevance judge</th>
      <th>Outcome</th>
    </tr></thead>
    <tbody id="rows"><tr><td colspan="5" class="empty">Pick a vendor and press <b>Request attestation</b>.</td></tr></tbody>
  </table></div>

  <footer>
    The severity counter is deterministic. The relevance judge is a Runtype agent asked one
    question only: can this evidence answer this control at all? Neither overrides the other &mdash;
    when they split, the control escalates and nothing is recorded. Rows marked <b>snapshot</b> replay
    a dependency scan captured on a real machine, because a Worker cannot run npm audit; rows marked
    <b>live</b> ran here, just now. Evidence is produced by the vendor, and its digest binds the
    bundle, not its truth.
  </footer>
</div>
<script>
const $ = s => document.querySelector(s)
const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))
let VENDOR = null

fetch('/api/meta').then(r => r.json()).then(m => {
  window.__meta = m
  $('#snap').textContent = 'dependency snapshot: ' + new Date(m.snapshot_at).toISOString().slice(0,16).replace('T',' ') + 'Z'
  VENDOR = m.vendors[0].id
  $('#tabs').innerHTML = m.vendors.map(v =>
    '<button class="tab' + (v.id === VENDOR ? ' on' : '') + '" data-v="' + esc(v.id) + '">' +
    esc(v.name) + '<span style="color:var(--mute)"> &middot; ' + esc(v.service) + '</span></button>').join('')
  // Run on arrival. A judge landing on an empty table has to be told what to do
  // before the page says anything; this way the result is the first thing there.
  setTimeout(function () { document.querySelector('#run').click() }, 150)

  $('#tabs').onclick = e => {
    const b = e.target.closest('.tab'); if (!b) return
    VENDOR = b.dataset.v
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === b))
    $('#rows').innerHTML = '<tr><td colspan="5" class="empty">Press <b>Request attestation</b>.</td></tr>'
    $('#status').textContent = 'idle'
  }
})

$('#run').onclick = async () => {
  const btn = $('#run'); btn.disabled = true
  const rows = []
  $('#summary').style.display = 'none'
  const v = (window.__meta.vendors.find(x => x.id === VENDOR) || {})
  $('#status').innerHTML = '<span class="spin"></span>' + esc(v.name) + "'s agent is collecting"
  $('#rows').innerHTML = ''
  try {
    for (const c of window.__meta.controls) {
      const tr = document.createElement('tr')
      tr.innerHTML = '<td><span class="id">' + esc(c.id) + '</span><div class="q">' + esc(c.question) + '</div></td>' +
        '<td colspan="4" class="q"><span class="spin"></span>waiting for ' + esc(v.name) + '&hellip;</td>'
      $('#rows').appendChild(tr)
      const res = await fetch('/api/run?control=' + encodeURIComponent(c.id) + '&vendor=' + encodeURIComponent(VENDOR))
      const r = (await res.json())[0]
      rows.push(r)
      tr.dataset.out = r.outcome
      tr.innerHTML =
        '<td data-l="control"><span class="id">' + esc(r.control_id) + '</span><div class="q">' + esc(r.question) + '</div></td>' +
        '<td data-l="evidence returned by vendor"><div class="from">' + esc(r.vendor_name) + ' agent &middot; ' + esc(r.evidence_method) +
          '<span class="tag">' + (r.evidence_live ? 'live' : 'snapshot') + '</span></div>' +
          '<div class="ev">answered "' + esc(r.vendor_answer) + '" &middot; ' + r.findings_total +
          ' findings, <b>' + r.findings_blocking + ' blocking</b></div>' +
          '<div class="dig">sha256 ' + esc(String(r.evidence_digest).slice(0,20)) + '&hellip;</div></td>' +
        '<td data-l="severity counter"><span class="v ' + esc(r.counter) + '">' + esc(r.counter) + '</span></td>' +
        '<td data-l="relevance judge"><span class="v ' + esc(String(r.judge).replace(/\s+/g,'-')) + '">' + esc(r.judge) + '</span>' +
          (r.judged_by ? '<div class="dig">' + esc(r.judged_by) + '</div>' : '') + '</td>' +
        '<td data-l="outcome"><span class="v ' + esc(r.outcome) + '">' + esc(r.outcome) + '</span>' +
          (r.judge_reason ? '<div class="why">' + esc(r.judge_reason) + '</div>' : '') +
          (r.escalation ? '<div class="note">' + esc(r.escalation) + '</div>' : '') + '</td>'
    }
    const esc_ = rows.filter(x => x.outcome === 'ESCALATED')
    const held = rows.filter(x => x.outcome === 'REFUTED').length
    const acc = rows.filter(x => x.outcome === 'SUPPORTED').length
    const sum = $('#summary')
    sum.style.display = 'block'
    sum.innerHTML = '<b>' + rows.length + ' controls: ' + held + ' held, ' + acc + ' accepted, ' +
      esc_.length + ' escalated.</b>' + (esc_.length
        ? ' On ' + esc_.map(x => x.control_id).join(', ') + ' the two gates disagreed, so nothing was recorded. ' +
          'The severity counter said <b>' + esc_.map(x => x.counter).join(', ') + '</b> on evidence the relevance judge found could not answer the question at all.'
        : '')
    $('#status').textContent = 'attestation complete'
  } catch (e) { $('#status').textContent = 'error: ' + e.message }
  btn.disabled = false
}
</script>
`
