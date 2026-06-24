import express from 'express'
import { Webhook } from 'svix'
import { env } from './src/config/env'

const app = express()

app.use(express.json({ 
  verify: (req: any, res, buf) => { req.rawBody = buf }
}))

app.post('/test', (req, res) => {
  console.log('Got webhook payload:')
  console.log(JSON.stringify(req.body, null, 2))
  res.send('ok')
})

app.listen(5001, () => {
  console.log('Listening on 5001...')
})
