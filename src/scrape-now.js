import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import { initDb } from './db.js'
import { scrapeBCV, scrapeUSDT } from './scraper.js'
import { saveSnapshot, nowVE } from './ratesService.js'

const BCV_URL = 'https://www.bcv.org.ve/glosario/cambio-oficial'
const USDT_URL = 'https://dolitoday.com/graficos/usdt.html'
const BCV_SELECTORS = {
  usd: '#dolar strong',
  eur: '#euro strong',
}

await initDb()

console.log('Scraping BCV...')
const bcv = await scrapeBCV({ url: BCV_URL, selectors: BCV_SELECTORS })
const fetchedAt = nowVE().toISOString()
if (bcv.usd?.price_number != null) {
  saveSnapshot('bcv', 'usd', bcv.usd.price_number, fetchedAt)
  console.log('  USD:', bcv.usd.price_number)
}
if (bcv.eur?.price_number != null) {
  saveSnapshot('bcv', 'eur', bcv.eur.price_number, fetchedAt)
  console.log('  EUR:', bcv.eur.price_number)
}

console.log('Scraping USDT...')
const usdtData = await scrapeUSDT({ url: USDT_URL, timeoutMs: 35000 })
if (usdtData.price_number != null) {
  saveSnapshot('usdt', 'usdt', usdtData.price_number, nowVE().toISOString())
  console.log('  USDT:', usdtData.price_number)
}

console.log('Listo. Snapshot guardado en ./data/rates.sqlite')
