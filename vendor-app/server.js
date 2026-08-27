// VendorCo public API.
// The system a bank's agent asks questions about, and the system Bob assesses.
// Deliberately imperfect: no security headers, and a pinned lodash with a
// published prototype-pollution CVE. Both are real findings, not props.
const express = require('express')
const _ = require('lodash')

const app = express()
app.use(express.json())

app.get('/health', (req, res) => res.json({ ok: true, service: 'vendorco-api' }))

app.post('/merge-config', (req, res) => {
  const defaults = { plan: 'free', seats: 1 }
  res.json(_.merge({}, defaults, req.body))
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`vendorco-api listening on ${port}`))
