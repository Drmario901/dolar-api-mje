import { chromium } from 'playwright'

const BINANCE_P2P_URL =
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search'
const BINANCE_TRADE_URL =
  'https://p2p.binance.com/es-LA/trade/all-payments/USDT?fiat=VES'
const BINANCE_ASSET = 'USDT'
const BINANCE_FIAT = 'VES'
const DEFAULT_BINANCE_ROWS = 20
const BINANCE_CACHE_TTL_MS = 15_000
const BINANCE_STALE_TTL_MS = 5 * 60_000
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const DEFAULT_FILTERS = {
  minPrice: 100,
  maxPrice: 2000,
  minDynamicMaxAmount: 100000,
  minMonthOrders: 100,
  minFinishRate: 0.95,
  minPositiveRate: 0.98,
  merchantOnly: false,
}
const STRICT_FILTERS = {
  minPrice: 100,
  maxPrice: 2000,
  minDynamicMaxAmount: 1000000,
  minMonthOrders: 1000,
  minFinishRate: 0.98,
  minPositiveRate: 0.99,
  merchantOnly: true,
}

let sharedBrowserPromise = null
let binanceSessionPromise = null
let usdtCache = {
  value: null,
  expiresAt: 0,
  staleUntil: 0,
  pending: null,
}

export async function scrapeBCV({ url, selectors, timeoutMs = 20000 }) {
  const browser = await getSharedBrowser()
  const context = await browser.newContext({
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
    userAgent: DEFAULT_USER_AGENT,
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
  }
}

export async function scrapeUSDT({
  payType = 'PagoMovil',
  referenceAmount = null,
  timeoutMs = 25000,
} = {}) {
  const now = Date.now()
  if (usdtCache.value && now < usdtCache.expiresAt) {
    return usdtCache.value
  }

  if (usdtCache.pending) {
    return usdtCache.pending
  }

  const requestBody = {
    asset: BINANCE_ASSET,
    fiat: BINANCE_FIAT,
    tradeType: 'BUY',
    page: 1,
    rows: DEFAULT_BINANCE_ROWS,
    payTypes: payType ? [payType] : [],
    publisherType: null,
  }

  usdtCache.pending = (async () => {
    try {
      const json = await fetchBinanceP2P(requestBody, timeoutMs)
      const rawAds = Array.isArray(json?.data) ? json.data : []
      const normalizedAds = rawAds.map(normalizeAd)
      const validAds = selectReferenceAds(normalizedAds, referenceAmount)
      const sortedAds = [...validAds].sort((a, b) => a.price - b.price)
      const averagePrice = trimmedAverage(sortedAds.map(ad => ad.price))
      const medianPrice = median(sortedAds.map(ad => ad.price))
      const bestPrice = sortedAds[0]?.price ?? null
      const weightedPrice = weightedAverage(sortedAds)
      const finalPrice =
        medianPrice ?? averagePrice ?? bestPrice ?? weightedPrice

      if (!Number.isFinite(finalPrice)) {
        throw new Error('No se pudo calcular la tasa USDT desde Binance P2P')
      }

      const result = {
        price_number: finalPrice,
        reportedAt: new Date().toISOString(),
      }

      usdtCache = {
        value: result,
        expiresAt: Date.now() + BINANCE_CACHE_TTL_MS,
        staleUntil: Date.now() + BINANCE_STALE_TTL_MS,
        pending: null,
      }

      return result
    } catch (error) {
      usdtCache.pending = null

      if (usdtCache.value && Date.now() < usdtCache.staleUntil) {
        return usdtCache.value
      }

      throw error
    }
  })()

  return usdtCache.pending
}

async function getSharedBrowser() {
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    }).catch(error => {
      sharedBrowserPromise = null
      throw error
    })
  }

  return sharedBrowserPromise
}

function parseBcvNumber(text) {
  if (!text) return null
  const cleaned = text.replace(/[^\d.,]/g, '')
  if (!cleaned) return null
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const n = Number.parseFloat(normalized)
  return Number.isNaN(n) ? null : n
}

async function fetchBinanceP2P(body, timeoutMs) {
  const session = await getBinanceSession(timeoutMs)
  const timer = setTimeout(() => {
    session.page
      .evaluate(() => window.stop())
      .catch(() => {})
  }, timeoutMs)

  try {
    const responseData = await session.page.evaluate(async ({ url, requestBody }) => {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
          clienttype: 'web',
        },
        body: JSON.stringify(requestBody),
      })

      const text = await response.text()

      return {
        ok: response.ok,
        status: response.status,
        text,
      }
    }, {
      url: BINANCE_P2P_URL,
      requestBody: body,
    })

    if (!responseData.ok) {
      throw new Error(`Binance P2P HTTP ${responseData.status}`)
    }

    const json = JSON.parse(responseData.text)
    assertBinanceSuccess(json)
    return json
  } catch (error) {
    await resetBinanceSession()
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function getBinanceSession(timeoutMs) {
  if (!binanceSessionPromise) {
    binanceSessionPromise = createBinanceSession(timeoutMs).catch(error => {
      binanceSessionPromise = null
      throw error
    })
  }

  return binanceSessionPromise
}

async function createBinanceSession(timeoutMs) {
  const browser = await getSharedBrowser()
  const context = await browser.newContext({
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1440, height: 960 },
    extraHTTPHeaders: {
      'accept-language': 'es-VE,es;q=0.9,en;q=0.8',
    },
  })

  const page = await context.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    })
  })
  await page.goto(BINANCE_TRADE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  })

  return { context, page }
}

async function resetBinanceSession() {
  if (!binanceSessionPromise) return

  const sessionPromise = binanceSessionPromise
  binanceSessionPromise = null

  try {
    const session = await sessionPromise
    await session.context.close()
  } catch {
    // Ignore cleanup failures when rotating the browser session.
  }
}

function assertBinanceSuccess(json) {
  const ok = json?.success === true || json?.code === '000000'
  if (!ok) {
    throw new Error(`Binance P2P error: ${JSON.stringify(json)}`)
  }
}

function selectReferenceAds(ads, referenceAmount) {
  for (const filters of [STRICT_FILTERS, DEFAULT_FILTERS]) {
    const filteredAds = ads.filter(ad => isValidAd(ad, filters, referenceAmount))
    const amountMatchedAds = pickAdsForReferenceAmount(filteredAds, referenceAmount)
    const clusteredAmountAds = removeOutliersByMedian(amountMatchedAds, 0.03)

    if (clusteredAmountAds.length >= 3) {
      return clusteredAmountAds
    }

    const clusteredFallbackAds = removeOutliersByMedian(filteredAds, 0.03)
    if (clusteredFallbackAds.length >= 3) {
      return Number.isFinite(referenceAmount) && referenceAmount > 0
        ? pickClosestByAmount(clusteredFallbackAds, referenceAmount, 5)
        : clusteredFallbackAds
    }
  }

  return []
}

function pickAdsForReferenceAmount(ads, referenceAmount) {
  if (!Number.isFinite(referenceAmount) || referenceAmount <= 0) {
    return ads
  }

  const matchingAds = ads.filter(
    ad => ad.minAmount <= referenceAmount && ad.maxAmount >= referenceAmount
  )

  if (matchingAds.length >= 3) {
    return pickClosestByAmount(matchingAds, referenceAmount, 5)
  }

  const nearbyAds = pickClosestByAmount(ads, referenceAmount, 6)

  return matchingAds.length ? uniqueAds([...matchingAds, ...nearbyAds]) : nearbyAds
}

function rangeDistance(ad, referenceAmount) {
  if (ad.minAmount <= referenceAmount && ad.maxAmount >= referenceAmount) {
    return 0
  }

  if (referenceAmount < ad.minAmount) {
    return ad.minAmount - referenceAmount
  }

  return referenceAmount - ad.maxAmount
}

function uniqueAds(ads) {
  return [...new Set(ads)]
}

function pickClosestByAmount(ads, referenceAmount, limit) {
  if (!Number.isFinite(referenceAmount) || referenceAmount <= 0) {
    return ads.slice(0, limit)
  }

  return [...ads]
    .sort((a, b) => {
      const distance = rangeDistance(a, referenceAmount) - rangeDistance(b, referenceAmount)
      if (distance !== 0) return distance
      return a.price - b.price
    })
    .slice(0, Math.min(limit, ads.length))
}

function normalizeAd(item) {
  const adv = item?.adv || {}
  const advertiser = item?.advertiser || {}

  return {
    price: Number(adv.price),
    minAmount: Number(adv.minSingleTransAmount || 0),
    maxAmount: Number(adv.dynamicMaxSingleTransAmount || adv.maxSingleTransAmount || 0),
    availableUSDT: Number(adv.dynamicMaxSingleTransQuantity || adv.tradableQuantity || 0),
    advertiser: {
      userType: advertiser.userType,
      monthOrderCount: Number(advertiser.monthOrderCount || 0),
      monthFinishRate: Number(advertiser.monthFinishRate || 0),
      positiveRate: Number(advertiser.positiveRate || 0),
    },
  }
}

function isValidAd(ad, filters, referenceAmount) {
  if (!Number.isFinite(ad.price)) return false
  if (ad.price < filters.minPrice) return false
  if (ad.price > filters.maxPrice) return false

  const minRequiredAmount =
    Number.isFinite(referenceAmount) && referenceAmount > 0
      ? referenceAmount
      : filters.minDynamicMaxAmount

  if (ad.maxAmount < minRequiredAmount) return false
  if (ad.advertiser.monthOrderCount < filters.minMonthOrders) return false
  if (ad.advertiser.monthFinishRate < filters.minFinishRate) return false
  if (ad.advertiser.positiveRate < filters.minPositiveRate) return false
  if (filters.merchantOnly && ad.advertiser.userType !== 'merchant') return false
  return true
}

function removeOutliersByMedian(ads, maxDeviation = 0.08) {
  if (!ads.length) return []

  const prices = ads.map(ad => ad.price).sort((a, b) => a - b)
  const mid = Math.floor(prices.length / 2)
  const median =
    prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2

  return ads.filter(ad => Math.abs(ad.price - median) / median <= maxDeviation)
}

function average(numbers) {
  if (!numbers.length) return null
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function median(numbers) {
  if (!numbers.length) return null
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function trimmedAverage(numbers, trimRatio = 0.2) {
  if (!numbers.length) return null

  const sorted = [...numbers].sort((a, b) => a - b)
  const trim = Math.floor(sorted.length * trimRatio)
  const trimmed = sorted.slice(trim, sorted.length - trim)

  return average(trimmed.length ? trimmed : sorted)
}

function weightedAverage(ads) {
  if (!ads.length) return null

  let weightedSum = 0
  let totalWeight = 0

  for (const ad of ads) {
    const weight = Math.max(ad.maxAmount, 1)
    weightedSum += ad.price * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

async function shutdown() {
  const browserPromise = sharedBrowserPromise
  sharedBrowserPromise = null
  binanceSessionPromise = null

  if (!browserPromise) return

  try {
    const browser = await browserPromise
    await browser.close()
  } catch {
    // Ignore shutdown failures.
  }
}
