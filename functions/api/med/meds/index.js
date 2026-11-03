// GET  /api/med/meds[?rev=N]  管理员：全部；板子：只返回启用的。rev 与当前一致时返回 {unchanged:true}
// POST /api/med/meds          仅管理员：新增一条提醒（cat 为类别：med/clinic/diet/sport/other，默认 med）
import { json, safe, normalize, rowToMed, bumpRev, getRev, MAX_MEDS } from "../_lib.js";

async function list({ request, env, data }) {
  const rev = await getRev(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const u = new URL(request.url);
  if (data.role === "device" && parseInt(u.searchParams.get("rev") || "0", 10) === rev) {
    return json({ now, rev, unchanged: true });
  }
  const sql = data.role === "device" ? "SELECT * FROM meds WHERE enabled = 1 ORDER BY id" : "SELECT * FROM meds ORDER BY id";
  const { results } = await env.DB.prepare(sql).all();
  return json({ now, rev, meds: results.map(rowToMed) });
}

async function create({ request, env, data }) {
  if (data.role !== "admin") return json({ error: "forbidden" }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const { med, err } = normalize(body);
  if (err) return json({ error: err }, 400);
  const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM meds").first();
  if (cnt.c >= MAX_MEDS) return json({ error: "最多 " + MAX_MEDS + " 条提醒" }, 400);

  const ts = Math.floor(Date.now() / 1000);
  const res = await env.DB.batch([
    env.DB.prepare("INSERT INTO meds (name, how, dose, times, kind, wmask, every_n, d_start, d_end, enabled, upd, cat) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)")
      .bind(med.name, med.how, med.dose, med.times.join(","), med.kind, med.wmask, med.every, med.start, med.end, med.enabled, ts, med.cat),
    bumpRev(env.DB),
  ]);
  return json({ id: res[0].meta.last_row_id });
}

export const onRequestGet = safe(list);
export const onRequestPost = safe(create);
