# OneSignal — Push al cambiar BCV

Cuando el precio del BCV (USD o EUR) **cambia** respecto al último guardado, la API envía una notificación push a todos los suscriptores de OneSignal (segmento "Subscribed Users").

## Configuración

En tu `.env`:

| Variable | Requerido | Descripción |
|----------|-----------|-------------|
| `ONESIGNAL_APP_ID` | Sí (para push) | App ID de tu proyecto OneSignal. |
| `ONESIGNAL_API_KEY` | Sí (para push) | REST API Key (no el User Auth Key). |
| `ONESIGNAL_IMAGE_URL` | No | URL de una imagen para la notificación (recomendado 2:1, ej. 1024×512 px). |

Si `ONESIGNAL_APP_ID` o `ONESIGNAL_API_KEY` no están definidos, **no se envía push** (el resto de la API funciona igual).

## Cuándo se envía

- **Cron BCV** (05:00 America/Caracas): después de guardar el nuevo snapshot, si USD o EUR cambió → se envía 1 push.
- **Scraping manual** (`pnpm run scrape`): misma lógica; si el BCV cambió respecto al último valor en la base → 1 push.

## Contenido del push

- **Título:** "BCV actualizado"
- **Cuerpo:** "Hay nuevas tasas. Entra a la app para verlas." (invita a abrir la app, sin mostrar precios)
- **Imagen:** la de `ONESIGNAL_IMAGE_URL` (Android: `big_picture`, iOS: `ios_attachments`, web: `chrome_web_image`)

## Segmento

Se usa el segmento **"Subscribed Users"** por defecto. En el dashboard de OneSignal puedes crear otros segmentos y cambiar el valor en `src/onesignal.js` (`included_segments`) si lo necesitas.
