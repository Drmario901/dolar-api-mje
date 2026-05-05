import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { routes } from './routes.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: '*' })

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('jwt secret missing')
}

await fastify.register(jwt, { secret: JWT_SECRET })

fastify.addHook('preHandler', async (request, reply) => {
  if (request.routerPath === '/health') return

  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
})

await fastify.register(routes)

const PORT = Number(process.env.PORT || 3000)

fastify
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`api running http://localhost:${PORT}`))
  .catch((err) => {
    fastify.log.error(err)
    process.exit(1)
  })