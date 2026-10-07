// Global treat counter, stored in a free Upstash Redis database
// (add it from Vercel > Storage; Vercel fills in the environment variables).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TOTAL = "chonks:treats";
const FEEDERS = "chonks:feeders";
const MAX_PER_REQUEST = 200;   // a page sends its treats in small batches
const MAX_PER_MINUTE = 1200;   // per IP, stops scripted spam

async function redis(cmds) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const out = await r.json();
  return out.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

function parseBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  return b && typeof b === "object" ? b : {};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(503).json({ error: "counter not set up yet" });

  try {
    if (req.method === "GET") {
      const [total, feeders] = await redis([["GET", TOTAL], ["SCARD", FEEDERS]]);
      return res.status(200).json({ total: Number(total) || 0, feeders: Number(feeders) || 0 });
    }

    if (req.method === "POST") {
      const { id, add } = parseBody(req);
      const n = Number(add);
      if (!Number.isInteger(n) || n < 1 || n > MAX_PER_REQUEST) return res.status(400).json({ error: "bad add" });
      if (typeof id !== "string" || !/^[a-z0-9]{6,40}$/.test(id)) return res.status(400).json({ error: "bad id" });

      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
      const rlKey = `chonks:rl:${ip}:${Math.floor(Date.now() / 60000)}`;
      const [used] = await redis([["INCRBY", rlKey, n], ["EXPIRE", rlKey, 120]]);
      if (Number(used) > MAX_PER_MINUTE) return res.status(429).json({ error: "slow down, he is still chewing" });

      const [total, , feeders] = await redis([["INCRBY", TOTAL, n], ["SADD", FEEDERS, id], ["SCARD", FEEDERS]]);
      return res.status(200).json({ total: Number(total) || 0, feeders: Number(feeders) || 0 });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(502).json({ error: "counter unavailable" });
  }
}
