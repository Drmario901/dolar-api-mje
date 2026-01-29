import Fastify from 'fastify'
import cors from '@fastify/cors'
import { routes } from './routes.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: '*' })
await fastify.register(routes)

const PORT = Number(process.env.PORT || 3002)

fastify
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => {
    console.log(`runing http://localhost:${PORT}`)
  })
  .catch((err) => {
    fastify.log.error(err)
    process.exit(1)
  })
