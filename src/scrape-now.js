import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import { initDb } from './db.js'
import { scrapeBCV, scrapeUSDT } from './scraper.js'
import { saveSnapshot, nowVE, getLatest } from './ratesService.js'
import { sendBcvUpdatePush } from './onesignal.js'

const BCV_URL = 'https://www.bcv.org.ve/glosario/cambio-oficial'
const USDT_URL = 'https://dolitoday.com/graficos/usdt.html'
const BCV_SELECTORS = {
  usd: '#dolar strong',
  eur: '#euro strong',
}

await initDb()

console.log('Scraping BCV...')
const prevUsd = getLatest('bcv', 'usd')?.value
const prevEur = getLatest('bcv', 'eur')?.value
const bcv = await scrapeBCV({ url: BCV_URL, selectors: BCV_SELECTORS })
const fetchedAt = nowVE().toISOString()
const newUsd = bcv.usd?.price_number
const newEur = bcv.eur?.price_number
if (newUsd != null) {
  saveSnapshot('bcv', 'usd', newUsd, fetchedAt)
  console.log('  USD:', newUsd)
}
if (newEur != null) {
  saveSnapshot('bcv', 'eur', newEur, fetchedAt)
  console.log('  EUR:', newEur)
}
const bcvChanged =
  (newUsd != null && newUsd !== prevUsd) || (newEur != null && newEur !== prevEur)
if (bcvChanged) {
  console.log('  BCV cambió → enviando push...')
  const result = await sendBcvUpdatePush({})
  console.log('  Push result:', JSON.stringify(result, null, 2))
  if (result.sent) console.log('  → Push enviado. ID:', result.id)
  else console.log('  → Push NO enviado. reason:', result.reason, result.message || '', result.data ? 'data: ' + JSON.stringify(result.data) : '')
}

console.log('Scraping USDT...')
const usdtData = await scrapeUSDT({ url: USDT_URL, timeoutMs: 35000 })
if (usdtData.price_number != null) {
  saveSnapshot('usdt', 'usdt', usdtData.price_number, nowVE().toISOString())
  console.log('  USDT:', usdtData.price_number)
}

console.log('Listo. Snapshot guardado en ./data/rates.sqlite')
