import { scrapeBCV, scrapeUSDT } from './scraper.js'

const BCV_URL = 'https://www.bcv.org.ve/glosario/cambio-oficial'
const USDT_URL = 'https://dolitoday.com/graficos/usdt.html'

const BCV_SELECTORS = {
  usd: '#dolar strong',
  eur: '#euro strong',
}

function nowVE() {
  const now = new Date()

  const veDate = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Caracas' })
  )

  return {
    iso: veDate.toISOString().replace('Z', '-04:00'),
    ts: veDate.getTime(),
  }
}

export async function routes(fastify) {
  fastify.get('/health', async () => ({ ok: true }))

  fastify.get('/rates', async (_request, reply) => {
    try {
      const bcvFetchedAt = nowVE()

      const bcv = await scrapeBCV({
        url: BCV_URL,
        selectors: BCV_SELECTORS,
      })

      const usd = bcv.usd?.price_number
      const eur = bcv.eur?.price_number

      if (usd == null || eur == null) {
        return reply.code(502).send({ error: 'No se pudo leer BCV' })
      }

      const usdtData = await scrapeUSDT({
        url: USDT_URL,
      })

      return {
        usd,
        eur,
        usdt: usdtData.price_number,

        bcvFetchedAt,                 
        usdtReportedAt: usdtData.reportedAt, 
        timestamp: nowVE(),
      }
    } catch (err) {
      return reply.code(500).send({
        error: 'Error consultando tasas',
        message: err?.message || String(err),
      })
    }
  })
}