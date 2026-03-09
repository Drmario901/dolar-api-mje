import cron from 'node-cron'
import { scrapeBCV, scrapeUSDT } from './scraper.js'
import { saveSnapshot, nowVE, getLatest } from './ratesService.js'
import { sendBcvUpdatePush } from './onesignal.js'

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
        const prevUsd = getLatest('bcv', 'usd')?.value
        const prevEur = getLatest('bcv', 'eur')?.value
        const bcv = await scrapeBCV({
          url: BCV_URL,
          selectors: BCV_SELECTORS,
        })
        const fetchedAt = nowVE().toISOString()
        const newUsd = bcv.usd?.price_number
        const newEur = bcv.eur?.price_number
        if (newUsd != null) saveSnapshot('bcv', 'usd', newUsd, fetchedAt)
        if (newEur != null) saveSnapshot('bcv', 'eur', newEur, fetchedAt)
        const changed =
          (newUsd != null && newUsd !== prevUsd) ||
          (newEur != null && newEur !== prevEur)
        if (changed && (newUsd != null || newEur != null)) {
          const result = await sendBcvUpdatePush({})
          if (result.sent) console.log('[scheduler] Push enviado:', result.id)
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
