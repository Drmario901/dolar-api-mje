import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import { getDb } from './db.js'
import { getBcvDisplayRates, getUsdtLatest, nowVE, _debugComputeBcvWindow, saveSnapshot } from './ratesService.js'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('America/Caracas')

const TZ = 'America/Caracas'

export async function routes(fastify) {
  fastify.get('/health', async () => ({ ok: true }))

  fastify.get('/rates', async (_request, reply) => {
    const bcv = getBcvDisplayRates()
    const usdt = getUsdtLatest()
    if (!bcv || !usdt) {
      return reply.code(503).send({
        error: 'No hay datos disponibles aún',
      })
    }
    const now = nowVE()
    return {
      bcv,
      usdt,
      timestamp: {
        iso: now.toISOString(),
        ts: now.valueOf(),
      },
    }
  })

  // ----- TEMPORAL DEBUG ENDPOINTS (fácil de borrar) -----
  fastify.get('/debug/bcv-window', async (request) => {
    const nowIso = request.query?.now ?? new Date().toISOString()
    return _debugComputeBcvWindow(nowIso, TZ, 19)
  })

  fastify.get('/debug/seed', async (_request, reply) => {
    getDb().prepare('DELETE FROM rate_snapshots').run()
    const preCutoff = dayjs.tz('2026-02-20 18:30:00', TZ).toISOString()
    const postCutoff = dayjs.tz('2026-02-20 19:30:00', TZ).toISOString()
    saveSnapshot('bcv', 'usd', 400, preCutoff)
    saveSnapshot('bcv', 'eur', 470, preCutoff)
    saveSnapshot('bcv', 'usd', 410, postCutoff)
    saveSnapshot('bcv', 'eur', 480, postCutoff)
    saveSnapshot('usdt', 'usdt', 405, postCutoff)
    return reply.send({
      ok: true,
      message: 'Seed insertado: BCV pre/post cutoff + USDT (temporal)',
    })
  })

  fastify.get('/debug/assert', async (_request, reply) => {
    const saturdayIso = dayjs.tz('2026-02-21 10:00:00', TZ).toISOString()
    const window = _debugComputeBcvWindow(saturdayIso, TZ, 19)
    const bcv = getBcvDisplayRates({ nowIso: saturdayIso })

    const checks = {
      inHoldWindow: window.inHoldWindow === true,
      publicadaUsd: bcv?.usd?.publicada?.value === 410,
      vigenteUsd: bcv?.usd?.vigente?.value === 400,
    }
    const passed = checks.inHoldWindow && checks.publicadaUsd && checks.vigenteUsd

    if (!passed) {
      return reply.code(500).send({
        ok: false,
        message: 'Assert falló (self-test BCV)',
        window,
        bcvUsd: bcv?.usd ?? null,
        checks,
      })
    }
    return reply.send({
      ok: true,
      message: 'Assert OK: sábado 10:00 → vigente 400, publicada 410',
      checks,
    })
  })
}
