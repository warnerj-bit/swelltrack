import { getStore } from "@netlify/blobs";

const WT_KEY = "2ddacbe9-9047-4761-bd81-a15a2307ed32";

export default async (req, context) => {
  // ── Parse query params ────────────────────────────────────────────────────
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat"));
  const lng = parseFloat(url.searchParams.get("lng"));

  if (isNaN(lat) || isNaN(lng)) {
    return new Response(JSON.stringify({ error: "Missing lat/lng" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Cache key: location + today's date (AEST UTC+10/11) ──────────────────
  // Use UTC+10 (AEST) as the base so cache refreshes at local midnight-ish
  const nowAEST = new Date(Date.now() + 10 * 3600000);
  const today = nowAEST.toISOString().slice(0, 10);
  const cacheKey = `tides_${lat.toFixed(4)}_${lng.toFixed(4)}_${today}`;

  // ── Try cache first ───────────────────────────────────────────────────────
  const store = getStore({ name: "tide-cache", consistency: "strong" });

  try {
    const cached = await store.get(cacheKey, { type: "json" });
    if (cached) {
      console.log(`Cache hit: ${cacheKey}`);
      return new Response(JSON.stringify({ ...cached, cached: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  } catch (e) {
    console.log("Cache read failed, fetching live:", e.message);
  }

  // ── Cache miss — fetch from WorldTides ───────────────────────────────────
  console.log(`Cache miss: ${cacheKey} — fetching WorldTides`);
  const wtUrl = `https://www.worldtides.info/api/v3?heights&extremes&date=${today}&lat=${lat}&lon=${lng}&days=7&step=3600&key=${WT_KEY}`;

  try {
    const wtRes = await fetch(wtUrl);
    if (!wtRes.ok) throw new Error(`WorldTides ${wtRes.status}`);
    const wtData = await wtRes.json();

    // Store in Blobs — expires naturally since key includes the date
    // We also set a 25h expiry so old keys get cleaned up automatically
    await store.set(cacheKey, wtData, { ttl: 60 * 60 * 25 });

    return new Response(JSON.stringify({ ...wtData, cached: false }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("WorldTides fetch failed:", e.message);
    return new Response(JSON.stringify({ error: "Tide data unavailable", detail: e.message }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};

export const config = {
  path: "/api/tides",
};
