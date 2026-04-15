import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWELVE_DATA_API_KEY = Deno.env.get('TWELVE_DATA_API_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function fetchQuote(symbol: string) {
  const res = await fetch(
    `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${TWELVE_DATA_API_KEY}`
  )
  const data = await res.json()
  if (data.status === 'error' || !data.close) return null
  return {
    symbol,
    current: parseFloat(data.close),
    high52: parseFloat(data.fifty_two_week?.high),
    low52: parseFloat(data.fifty_two_week?.low),
  }
}

async function alreadyNotified(deviceId: string, symbol: string, alertType: string) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('notifications_sent')
    .select('id')
    .eq('device_id', deviceId)
    .eq('symbol', symbol)
    .eq('alert_type', alertType)
    .gte('sent_at', oneDayAgo)
  return data && data.length > 0
}

async function sendNotification(pushToken: string, title: string, body: string) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: pushToken, title, body, sound: 'default' }),
  })
}

async function recordNotification(deviceId: string, pushToken: string, symbol: string, alertType: string) {
  await supabase.from('notifications_sent').insert({
    device_id: deviceId,
    push_token: pushToken,
    symbol,
    alert_type: alertType
  })
}

Deno.serve(async (req) => {
  // Verify secret header
  const authHeader = req.headers.get('x-cron-secret')
  if (authHeader !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const { data: watchlists } = await supabase
      .from('watchlists')
      .select('device_id, push_token, symbol')

    if (!watchlists || watchlists.length === 0) {
      return new Response(JSON.stringify({ message: 'No watchlists found' }), { status: 200 })
    }

    const symbols = [...new Set(watchlists.map((w: any) => w.symbol))]
    const quotes: Record<string, any> = {}

    for (const symbol of symbols) {
      const quote = await fetchQuote(symbol as string)
      if (quote) quotes[symbol as string] = quote
      await new Promise((r) => setTimeout(r, 500))
    }

    let notificationsSent = 0

    for (const { device_id, push_token, symbol } of watchlists) {
      const quote = quotes[symbol]
      if (!quote) continue

      const { current, high52, low52 } = quote
      const threshold = 0.01

      if (Math.abs(current - high52) / high52 <= threshold) {
        const alerted = await alreadyNotified(device_id, symbol, '52w_high')
        if (!alerted) {
          await sendNotification(push_token, `${symbol} 52W High Alert`, `${symbol} is at $${current.toFixed(2)}, near its 52-week high of $${high52.toFixed(2)}`)
          await recordNotification(device_id, push_token, symbol, '52w_high')
          notificationsSent++
        }
      }

      if (Math.abs(current - low52) / low52 <= threshold) {
        const alerted = await alreadyNotified(device_id, symbol, '52w_low')
        if (!alerted) {
          await sendNotification(push_token, `${symbol} 52W Low Alert`, `${symbol} is at $${current.toFixed(2)}, near its 52-week low of $${low52.toFixed(2)}`)
          await recordNotification(device_id, push_token, symbol, '52w_low')
          notificationsSent++
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Checked ${symbols.length} symbols, sent ${notificationsSent} notifications` }),
      { status: 200 }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})