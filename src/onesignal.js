const ONESIGNAL_URL = 'https://api.onesignal.com/notifications'

function log(...args) {
  console.log('[onesignal]', ...args)
}

export async function sendBcvUpdatePush({ imageUrl }) {
  const appId = process.env.ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_API_KEY

  log('sendBcvUpdatePush called, app_id:', appId ? `${appId.slice(-4)}...` : 'MISSING', 'api_key:', apiKey ? '***' : 'MISSING')

  if (!appId || !apiKey) {
    log('ABORT: missing ONESIGNAL_APP_ID or ONESIGNAL_API_KEY in .env')
    return { sent: false, reason: 'missing_config' }
  }

  const title = 'BCV actualizado'
  const message = 'Hay nuevas tasas. Entra a la app para verlas.'

  const body = {
    app_id: appId,
    target_channel: 'push',
    included_segments: ['All'],
    headings: { en: title, es: title },
    contents: { en: message, es: message },
  }

  const img = imageUrl || process.env.ONESIGNAL_IMAGE_URL
  if (img) {
    body.big_picture = img
    body.chrome_web_image = img
    body.ios_attachments = { id: img.includes('?') ? img : `${img}?filetype=file.jpg` }
  }

  log('POST', ONESIGNAL_URL, 'segments:', body.included_segments, 'image:', !!img)

  try {
    const res = await fetch(ONESIGNAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch((e) => {
      log('response parse error', e?.message)
      return {}
    })

    log('response status:', res.status, 'body:', JSON.stringify(data, null, 2))

    if (!res.ok) {
      log('API error:', res.status, data)
      return { sent: false, reason: 'api_error', status: res.status, data }
    }
    if (!data.id) {
      log('No id in response → no recipients in segment. Errors from API:', data.errors)
      return {
        sent: false,
        reason: 'no_recipients',
        message: 'OneSignal no tiene suscriptores en el segmento. Revisa en el dashboard que haya usuarios con push activo.',
        data,
      }
    }
    log('OK notification id:', data.id)
    return { sent: true, id: data.id }
  } catch (err) {
    log('request_error', err?.message || err)
    return { sent: false, reason: 'request_error', error: err?.message }
  }
}
