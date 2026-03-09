const ONESIGNAL_URL = 'https://api.onesignal.com/notifications'

export async function sendBcvUpdatePush({ imageUrl }) {
  const appId = process.env.ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_API_KEY
  if (!appId || !apiKey) {
    return { sent: false, reason: 'missing_config' }
  }

  const title = 'BCV actualizado'
  const message = 'Hay nuevas tasas. Entra a la app para verlas.'

  const body = {
    app_id: appId,
    target_channel: 'push',
    included_segments: ['Subscribed Users'],
    headings: { en: title, es: title },
    contents: { en: message, es: message },
  }

  const img = imageUrl || process.env.ONESIGNAL_IMAGE_URL
  if (img) {
    body.big_picture = img
    body.chrome_web_image = img
    body.ios_attachments = { id: img.includes('?') ? img : `${img}?filetype=file.jpg` }
  }

  try {
    const res = await fetch(ONESIGNAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[onesignal]', res.status, data)
      return { sent: false, reason: 'api_error', status: res.status, data }
    }
    return { sent: true, id: data.id }
  } catch (err) {
    console.error('[onesignal]', err?.message || err)
    return { sent: false, reason: 'request_error', error: err?.message }
  }
}
