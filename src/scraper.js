import { chromium } from 'playwright'

const BINANCE_P2P_URL =
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search'
const BINANCE_ASSET = 'USDT'
const BINANCE_FIAT = 'VES'
const DEFAULT_BINANCE_ROWS = 20
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
  payType = 'PagoMovil',
  referenceAmount = null,
  timeoutMs = 25000,
} = {}) {
  const requestBody = {
    asset: BINANCE_ASSET,
    fiat: BINANCE_FIAT,
    tradeType: 'BUY',
    page: 1,
    rows: DEFAULT_BINANCE_ROWS,
    payTypes: payType ? [payType] : [],
    publisherType: null,
  }

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

  return {
    price_number: finalPrice,
    reportedAt: new Date().toISOString(),
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

async function fetchBinanceP2P(body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(BINANCE_P2P_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Binance P2P HTTP ${response.status}`)
    }

    const json = await response.json()
    assertBinanceSuccess(json)
    return json
  } finally {
    clearTimeout(timer)
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
