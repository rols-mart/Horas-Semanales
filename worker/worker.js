// Cloudflare Worker: stores one arrival time per day, stamped by the server.
// Bindings: KV namespace ARRIVALS, variables KEY (secret) and TZ (e.g. America/Mexico_City).
const KEEP_SECONDS = 60 * 60 * 24 * 35;
const PREFIX = 'arrival:';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.searchParams.get('key') !== env.KEY) return new Response('unauthorized', { status: 401 });

    const day = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: env.TZ });
    const time = (ms) => new Date(ms).toLocaleTimeString('en-US',
      { timeZone: env.TZ, hour: '2-digit', minute: '2-digit' });
    const readTs = async (key) => {
      const stored = JSON.parse((await env.ARRIVALS.get(key)) || 'null');
      return stored && stored.ts;
    };
    const todayKey = PREFIX + day(Date.now());

    // Today's arrival timestamp, or null (kept for older extension versions).
    if (url.pathname === '/arrival') return Response.json({ ts: (await readTs(todayKey)) || null });

    // Recent arrivals, one per day: { days: { 'YYYY-MM-DD': ts } }.
    if (url.pathname === '/arrivals') {
      const { keys } = await env.ARRIVALS.list({ prefix: PREFIX });
      const days = {};
      await Promise.all(keys.map(async ({ name }) => {
        days[name.slice(PREFIX.length)] = await readTs(name);
      }));
      return Response.json({ days });
    }

    // Called by the phone shortcut. Asks for ?force=1 to overwrite today's arrival.
    if (url.pathname === '/arrive' && req.method === 'POST') {
      const existing = await readTs(todayKey);
      if (existing && !url.searchParams.has('force')) {
        return Response.json({ status: 'exists', ts: existing, time: time(existing) }, { status: 409 });
      }
      const ts = Date.now();
      await env.ARRIVALS.put(todayKey, JSON.stringify({ ts }), { expirationTtl: KEEP_SECONDS });
      return Response.json({ status: 'saved', ts, time: time(ts) });
    }
    return new Response('not found', { status: 404 });
  },
};
