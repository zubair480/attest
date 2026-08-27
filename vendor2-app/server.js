// Northwind Systems public API.
//
// A deliberately different risk profile from vendorco-api. Dependencies are
// current, input is validated, the lockfile is committed -- and there is a
// live credential sitting in the source. Two vendors that both answer "yes"
// to everything fail in completely different places, which is the whole
// reason a bank runs a portfolio rather than one questionnaire.
const express = require('express')

const app = express()
app.use(express.json())

// Hardcoded credential. This is the finding.
//
// Deliberately not in any payment provider's real key format: GitHub push
// protection rejected the first version of this file, which is a fair result
// and not one worth fighting. A generic assignment is what most real leaks
// look like anyway.
const PAYMENT_API_SECRET = 'live_9f3a2b7c8d1e4f60a5b8c2d7e1f4a6b39'

app.get('/health', (req, res) => res.json({ ok: true, service: 'northwind-api' }))

app.post('/config', (req, res) => {
  const { plan, seats } = req.body || {}
  if (typeof plan !== 'string' || !Number.isInteger(seats)) {
    return res.status(400).json({ error: 'plan must be a string and seats an integer' })
  }
  res.json({ plan, seats })
})

const port = process.env.PORT || 3001
app.listen(port, () => console.log(`northwind-api listening on ${port}`))
