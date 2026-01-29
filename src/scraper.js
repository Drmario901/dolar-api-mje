import { chromium } from 'playwright'

export async function scrapeBCV({ url, selectors, timeoutMs = 20000 }) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'es-VE',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  })
  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

    const result = {}

    for (const [key, selector] of Object.entries(selectors)) {
      await page.waitForSelector(selector, { timeout: timeoutMs })
      const raw = await page.$eval(selector, el => (el.textContent || '').trim())
      result[key] = { price_number: parseBcvNumber(raw) }
    }

    return result
  } finally {
    await context.close()
    await browser.close()
  }
}

export async function scrapeUSDT({
  url,
  priceSelector = '#rate-value',
  dateSelector = '#summary-date',
  timeoutMs = 25000,
}) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'es-VE',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  })
  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

    await page.waitForTimeout(800)

    await page.waitForSelector(priceSelector, { timeout: timeoutMs })

    await page.waitForFunction(
      sel => {
        const el = document.querySelector(sel)
        if (!el) return false
        const t = (el.textContent || '').trim().toLowerCase()
        if (!t) return false
        if (t.includes('cargando')) return false
        if (t.includes('-')) return false
        return /\d/.test(t)
      },
      priceSelector,
      { timeout: timeoutMs }
    )

    const priceRaw = await page.$eval(priceSelector, el => (el.textContent || '').trim())

    let dateText = null
    try {
      await page.waitForSelector(dateSelector, { timeout: 4000 })
      dateText = await page.$eval(dateSelector, el => (el.textContent || '').trim())
      if (dateText?.toLowerCase().includes('cargando')) dateText = null
    } catch {}

    return {
      price_number: parseDoliNumber(priceRaw),
      reportedAt: dateText,
    }
  } finally {
    await context.close()
    await browser.close()
  }
}

function parseBcvNumber(text) {
  if (!text) return null
  const cleaned = text.replace(/[^\d.,]/g, '')
  if (!cleaned) return null
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const n = Number.parseFloat(normalized)
  return Number.isNaN(n) ? null : n
}

function parseDoliNumber(text) {
  if (!text) return null
  const cleaned = text.replace(/[^\d.,]/g, '')
  if (!cleaned) return null

  const hasDot = cleaned.includes('.')
  const hasComma = cleaned.includes(',')

  let normalized = cleaned
  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '')
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.')
  }

  const n = Number.parseFloat(normalized)
  return Number.isNaN(n) ? null : n
}