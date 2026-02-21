import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { routes } from './routes.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: '*' })
await fastify.register(routes)

const PORT = Number(process.env.PORT || 3000)

fastify
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`api running http://localhost:${PORT}`))
  .catch((err) => {
    fastify.log.error(err)
    process.exit(1)
  })