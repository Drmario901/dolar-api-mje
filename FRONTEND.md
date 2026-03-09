# API dolar-api-mje — Contexto para frontend

Documentación para consumir la API desde el frontend: endpoints, respuestas y conceptos (BCV vigente/publicada, zona horaria).

---

## Base URL y CORS

- **Base URL:** la que despliegues (ej. `https://api.ejemplo.com` o `http://localhost:3002`).
- **CORS:** permitido para cualquier origen (`*`). No hace falta enviar headers especiales desde el navegador.
- **Autenticación:** ninguna. No se envían tokens ni cookies.

---

## Endpoints públicos (para el frontend)

### `GET /health`

Comprueba que la API está viva.

**Respuesta:** `200 OK`

```json
{ "ok": true }
```

---

### `GET /rates`

Devuelve tasas BCV (USD, EUR) y USDT, con lógica BCV vigente/publicada y timestamp en Venezuela.

**Respuesta exitosa:** `200 OK`

```json
{
  "bcv": {
    "usd": {
      "vigente": {
        "value": 36.5,
        "fetched_at": "2026-02-21T22:30:00.000Z",
        "rule": "normal"
      },
      "publicada": {
        "value": 36.5,
        "fetched_at": "2026-02-21T22:30:00.000Z"
      }
    },
    "eur": {
      "vigente": { "value": 39.2, "fetched_at": "...", "rule": "normal" },
      "publicada": { "value": 39.2, "fetched_at": "..." }
    }
  },
  "usdt": {
    "value": 37.1,
    "fetched_at": "2026-02-21T17:20:00.000Z"
  },
  "timestamp": {
    "iso": "2026-02-21T22:35:00.000-04:00",
    "ts": 1737599700000
  }
}
```

**Errores**

| Código | Cuerpo | Cuándo |
|--------|--------|--------|
| `503` | `{ "error": "No hay datos disponibles aún" }` | No hay datos BCV o USDT (API recién levantada o sin scrape). |

---

## Conceptos para el frontend

### Zona horaria

- Toda la lógica de “día” y “ventana” del BCV usa **America/Caracas**.
- Las fechas en la respuesta:
  - **`timestamp.iso`**: instante actual en Caracas (puede llevar offset `-04:00`).
  - **`timestamp.ts`**: mismo instante en milisegundos (para `new Date(timestamp.ts)`).
  - **`fetched_at`**: siempre en **ISO UTC** (termina en `Z`), para comparar y mostrar en la zona que quieras.

### BCV: vigente vs publicada

- **publicada:** última tasa publicada por el BCV (la más reciente en la base).
- **vigente:** tasa que “rige” según la regla del BCV:
  - De **lunes a viernes antes de las 19:00** (Caracas): vigente = publicada.
  - **Viernes ≥ 19:00, sábado y domingo:** el BCV mantiene la tasa del viernes hasta las 19:00; después de ese corte se considera “adelantada” la del lunes. La API devuelve:
    - **vigente:** última tasa **antes** del viernes 19:00 (la que sigue “vigente” en el fin de semana).
    - **publicada:** la última publicada (puede ser la “adelantada” del lunes).

Para **mostrar al usuario** suele usarse **vigente** (la que aplica para operaciones). **publicada** sirve para mostrar “última publicada” o comparar.

### Campo `rule` (BCV)

Indica cómo se calculó **vigente**:

| Valor | Significado |
|-------|-------------|
| `normal` | Lunes–viernes antes de las 19:00; vigente = publicada. |
| `hold_window` | Viernes ≥ 19:00 o fin de semana; vigente = última antes del viernes 19:00. |
| `fallback_latest` | En ventana de hold pero no hay histórico antes del corte; vigente = publicada. |
| `initial_state` | Sin histórico suficiente; vigente = publicada. |

Puedes usar `rule` para mostrar un texto o un indicador (ej. “Tasa vigente”, “Tasa adelantada”).

### USDT

- **`usdt.value`**: última tasa USDT guardada (ej. DoliToday).
- **`usdt.fetched_at`**: momento en que se obtuvo (ISO UTC).

No tiene lógica vigente/publicada; es un solo valor “último”.

---

## Tipos (TypeScript) de ejemplo

```ts
// Respuesta de GET /rates
interface RatesResponse {
  bcv: {
    usd: BcvCurrencyRow
    eur: BcvCurrencyRow
  }
  usdt: {
    value: number
    fetched_at: string // ISO UTC
  }
  timestamp: {
    iso: string   // America/Caracas
    ts: number    // ms
  }
}

interface BcvCurrencyRow {
  vigente: {
    value: number
    fetched_at: string // ISO UTC
    rule: 'normal' | 'hold_window' | 'fallback_latest' | 'initial_state'
  }
  publicada: {
    value: number
    fetched_at: string // ISO UTC
  }
}

// Error 503
interface RatesError {
  error: string
}
```

---

## Uso típico en el frontend

1. **Polling o carga inicial:** `GET /rates` cada X segundos o al cargar.
2. **Mostrar tasas:** usar `bcv.usd.vigente.value` (y `bcv.eur.vigente.value`) para “tasa vigente”; opcionalmente `publicada` para “última publicada”.
3. **Fecha/hora:** usar `timestamp.iso` o `timestamp.ts` para “actualizado a las …” en Caracas; usar `fetched_at` en UTC y formatear en la zona del usuario si quieres.
4. **USDT:** mostrar `usdt.value` y, si aplica, `usdt.fetched_at`.
5. **Sin datos:** si la API devuelve `503`, mostrar mensaje tipo “No hay datos disponibles aún” y reintentar más tarde.

---

## Endpoints de debug (temporales)

En algunos entornos existen rutas **solo para pruebas**. No confíes en ellas en producción; pueden eliminarse.

- `GET /debug/bcv-window?now=ISO` — calcula ventana BCV para un instante dado.
- `GET /debug/seed` — inserta datos de prueba (borra los actuales).
- `GET /debug/assert` — comprueba la lógica BCV con datos de prueba.

No es necesario consumirlos desde el frontend; son para desarrollo/QA.
