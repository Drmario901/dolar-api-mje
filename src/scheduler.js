import cron from 'node-cron'
import { scrapeBCV, scrapeUSDT } from './scraper.js'
import { saveSnapshot, nowVE } from './ratesService.js'

const BCV_URL = 'https://www.bcv.org.ve/glosario/cambio-oficial'
const USDT_URL = 'https://dolitoday.com/graficos/usdt.html'
const BCV_SELECTORS = {
  usd: '#dolar strong',
  eur: '#euro strong',
}

const TZ = 'America/Caracas'

export function startScheduler() {
  cron.schedule(
    '0 5 * * *',
    async () => {
      try {
        const bcv = await scrapeBCV({
          url: BCV_URL,
          selectors: BCV_SELECTORS,
        })
        const fetchedAt = nowVE().toISOString()
        if (bcv.usd?.price_number != null) {
          saveSnapshot('bcv', 'usd', bcv.usd.price_number, fetchedAt)
        }
        if (bcv.eur?.price_number != null) {
          saveSnapshot('bcv', 'eur', bcv.eur.price_number, fetchedAt)
        }
      } catch (err) {
        console.error('[scheduler] BCV error', err?.message || err)
      }
    },
    { timezone: TZ }
  )

  cron.schedule(
    '0 * * * *',
    async () => {
      try {
        const usdtData = await scrapeUSDT({
          url: USDT_URL,
          timeoutMs: 35000,
        })
        if (usdtData.price_number != null) {
          saveSnapshot('usdt', 'usdt', usdtData.price_number, nowVE().toISOString())
        }
      } catch (err) {
        console.error('[scheduler] USDT error', err?.message || err)
      }
    },
    { timezone: TZ }
  )
}
