// Supabase Edge Function: stock-quote
//
// Proxies Twelve Data quote requests so the Twelve Data API key never ships
// in the mobile client bundle. Deploy with:
//
//   supabase functions deploy stock-quote
//   supabase secrets set TWELVE_DATA_API_KEY=<your-key>
//
// Client invocation:
//
//   const { data, error } = await supabase.functions.invoke('stock-quote', {
//     body: { symbol: 'AAPL' },
//   });
//
// Expected request body: { symbol: string }
// Response shape mirrors Twelve Data's /quote endpoint so client parsing
// logic in fetchStockData stays unchanged.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — this file runs in Deno (Supabase Edge runtime), not Node.

const TWELVE_DATA_API_KEY = Deno.env.get('TWELVE_DATA_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ status: 'error', message: 'Method not allowed' }, 405);
  }

  if (!TWELVE_DATA_API_KEY) {
    return jsonResponse(
      { status: 'error', message: 'Server misconfigured: missing TWELVE_DATA_API_KEY' },
      500,
    );
  }

  let symbol: string | undefined;
  try {
    const body = await req.json();
    symbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : undefined;
  } catch {
    return jsonResponse({ status: 'error', message: 'Invalid JSON body' }, 400);
  }

  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return jsonResponse({ status: 'error', message: 'Invalid symbol' }, 400);
  }

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${TWELVE_DATA_API_KEY}`;
    const upstream = await fetch(url);
    const data = await upstream.json();
    return jsonResponse(data, upstream.ok ? 200 : upstream.status);
  } catch (err) {
    console.error('stock-quote upstream error', err);
    return jsonResponse({ status: 'error', message: 'Upstream fetch failed' }, 502);
  }
});
