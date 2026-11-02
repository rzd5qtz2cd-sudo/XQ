// GET  /api/med/acks?since=YYYY-MM-DD  读取服药记录（网页显示"是否已阅读"）
// POST /api/med/acks                   板子上报：{"acks":[{"m":药id,"d":"YYYY-MM-DD","t":"HH:MM","s":"read|missed","at":秒}]}
import { json, safe, validDate } from "./_lib.js";

async function list({ request, env }) {
  const u = new URL(request.url);
  const since = validDate(u.searchParams.get("since")) ? u.searchParams.get("since") : "0000-00-00";
  const { results } = await env.DB.prepare(
    "SELECT med_id, date, slot, status, at FROM med_acks WHERE date >= ?1 ORDER BY date DESC, slot LIMIT 2000"
  ).bind(since).all();
  return json({ now: Math.floor(Date.now() / 1000), acks: results });
}

async function report({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const arr = Array.isArray(body.acks) ? body.acks.slice(0, 50) : [];
  const stmts = [];
  for (const a of arr) {
    const m = parseInt(a.m, 10), at = parseInt(a.at, 10) || Math.floor(Date.now() / 1000);
    if (!(m > 0) || !validDate(a.d) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.t) || !["read", "missed"].includes(a.s)) continue;
    // 已经是 read 的记录不会被 missed 覆盖；missed 之后补读可以升级为 read
    stmts.push(
      env.DB.prepare(
        "INSERT INTO med_acks (med_id, date, slot, status, at) VALUES (?1,?2,?3,?4,?5) " +
        "ON CONFLICT(med_id, date, slot) DO UPDATE SET status = excluded.status, at = excluded.at WHERE med_acks.status != 'read'"
      ).bind(m, a.d, a.t, a.s, at)
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  const old = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);   // 只保留 90 天
  await env.DB.prepare("DELETE FROM med_acks WHERE date < ?1").bind(old).run();
  return json({ saved: stmts.length });
}

export const onRequestGet = safe(list);
export const onRequestPost = safe(report);
