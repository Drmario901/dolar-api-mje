import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import { getDb } from './db.js'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('America/Caracas')

export function nowVE() {
  return dayjs().tz('America/Caracas')
}

export function saveSnapshot(source, currency, value, fetchedAtISO) {
  const stmt = getDb().prepare(
    'INSERT OR IGNORE INTO rate_snapshots (source, currency, value, fetched_at) VALUES (?, ?, ?, ?)'
  )
  stmt.run(source, currency, value, fetchedAtISO)
}

export function getLatest(source, currency) {
  const row = getDb()
    .prepare(
      'SELECT value, fetched_at FROM rate_snapshots WHERE source = ? AND currency = ? ORDER BY fetched_at DESC LIMIT 1'
    )
    .get(source, currency)
  return row ? { value: row.value, fetched_at: row.fetched_at } : null
}

export function getLatestBefore(source, currency, cutoffISO) {
  const row = getDb()
    .prepare(
      'SELECT value, fetched_at FROM rate_snapshots WHERE source = ? AND currency = ? AND fetched_at < ? ORDER BY fetched_at DESC LIMIT 1'
    )
    .get(source, currency, cutoffISO)
  return row ? { value: row.value, fetched_at: row.fetched_at } : null
}

function bcvRowForCurrency(currency, nowOverride) {
  const now = nowOverride ?? nowVE()
  const day = now.day()
  const hour = now.hour()
  const isFriday = day === 5
  const isSaturday = day === 6
  const isSunday = day === 0
  const inHoldWindow =
    (isFriday && hour >= 19) || isSaturday || isSunday

  const publicada = getLatest('bcv', currency)
  if (!publicada) return null

  let vigente
  let rule

  if (inHoldWindow) {
    let viernesRef = now.clone()
    if (day === 6) viernesRef = viernesRef.subtract(1, 'day')
    if (day === 0) viernesRef = viernesRef.subtract(2, 'day')
    const cutoff = viernesRef
      .set('hour', 19)
      .set('minute', 0)
      .set('second', 0)
      .set('millisecond', 0)
    const cutoffISO = cutoff.toISOString()
    vigente = getLatestBefore('bcv', currency, cutoffISO)
    if (!vigente) {
      vigente = publicada
      rule = 'fallback_latest'
    } else {
      rule = 'hold_window'
    }
  } else {
    vigente = publicada
    rule = 'normal'
  }

  if (!vigente) {
    vigente = publicada
    rule = 'initial_state'
  }

  return {
    vigente: {
      value: vigente.value,
      fetched_at: vigente.fetched_at,
      rule,
    },
    publicada: {
      value: publicada.value,
      fetched_at: publicada.fetched_at,
    },
  }
}

export function getBcvDisplayRates(opts) {
  const nowOverride =
    opts?.nowIso != null
      ? dayjs(opts.nowIso).tz('America/Caracas')
      : undefined
  const usd = bcvRowForCurrency('usd', nowOverride)
  const eur = bcvRowForCurrency('eur', nowOverride)
  if (!usd || !eur) return null
  return { usd, eur }
}

export function getUsdtLatest() {
  return getLatest('usdt', 'usdt')
}

export function _debugComputeBcvWindow(nowIso, tz = 'America/Caracas', cutoffHour = 19) {
  const now = dayjs(nowIso).tz(tz)
  const day = now.day()
  const hour = now.hour()
  const isFriday = day === 5
  const isSaturday = day === 6
  const isSunday = day === 0
  const inHoldWindow =
    (isFriday && hour >= cutoffHour) || isSaturday || isSunday

  let refFriday_local = null
  let cutoff_local = null
  let cutoff_iso = null

  if (inHoldWindow) {
    let viernesRef = now.clone()
    if (day === 6) viernesRef = viernesRef.subtract(1, 'day')
    if (day === 0) viernesRef = viernesRef.subtract(2, 'day')
    refFriday_local = viernesRef.format()
    const cutoff = viernesRef
      .clone()
      .set('hour', cutoffHour)
      .set('minute', 0)
      .set('second', 0)
      .set('millisecond', 0)
    cutoff_local = cutoff.format()
    cutoff_iso = cutoff.toISOString()
  }

  return {
    now_local: now.format(),
    day,
    hour,
    inHoldWindow,
    refFriday_local,
    cutoff_local,
    cutoff_iso,
  }
}
