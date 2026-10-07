// Relays the $CHONKS money report from Stonkerage so the page can read it
// (Stonkerage doesn't let other websites call its API directly).
const CA = process.env.CHONKS_CA || "FXQPeVeEx9n2J1Qb7tmtPWxAbbKm36r2xoKve6RShKZh";

export default async function handler(req, res) {
  try {
    const r = await fetch(`https://stonkerage.fun/api/tokens/${CA}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json();
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    res.status(200).json(data);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "money report unavailable" });
  }
}
