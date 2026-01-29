import 'dotenv/config'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const secret = process.env.JWT_SECRET
if (!secret) {
  console.error('jwt secret missing')
  process.exit(1)
}

const payload = {
  sub: 'mje-rate-fetcher',
  scope: ['rates:read'],
  jti: crypto.randomUUID(),
}

const token = jwt.sign(payload, secret, { algorithm: 'HS256' })

console.log(token)
