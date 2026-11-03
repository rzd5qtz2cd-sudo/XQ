// PUT    /api/med/meds/:id  仅管理员：修改（可只传要改的字段，如 {"enabled":false}）
// DELETE /api/med/meds/:id  仅管理员：删除（同时删除它的服药记录）
import { json, safe, normalize, rowToMed, bumpRev } from "../_lib.js";

async function update({ request, env, data, params }) {
  if (data.role !== "admin") return json({ error: "forbidden" }, 403);
  const id = parseInt(params.id, 10);
  const row = await env.DB.prepare("SELECT * FROM meds WHERE id = ?1").bind(id).first();
  if (!row) return json({ error: "not found" }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const old = rowToMed(row);
  const { med, err } = normalize({ ...old, ...body });
  if (err) return json({ error: err }, 400);

  // 只有"提醒规则"变了才更新 upd（此前的时间点不再提醒/统计）；单改名称/用法/用量不影响
  const ruleChanged =
    old.times.join(",") !== med.times.join(",") || old.kind !== med.kind || old.wmask !== med.wmask ||
    old.every !== med.every || old.start !== med.start || old.end !== med.end || old.enabled !== !!med.enabled;
  const upd = ruleChanged ? Math.floor(Date.now() / 1000) : old.upd;

  await env.DB.batch([
    env.DB.prepare("UPDATE meds SET name=?2, how=?3, dose=?4, times=?5, kind=?6, wmask=?7, every_n=?8, d_start=?9, d_end=?10, enabled=?11, upd=?12, cat=?13 WHERE id=?1")
      .bind(id, med.name, med.how, med.dose, med.times.join(","), med.kind, med.wmask, med.every, med.start, med.end, med.enabled, upd, med.cat),
    bumpRev(env.DB),
  ]);
  return json({ ok: true });
}

async function remove({ env, data, params }) {
  if (data.role !== "admin") return json({ error: "forbidden" }, 403);
  const id = parseInt(params.id, 10);
  if (!(id > 0)) return json({ error: "bad id" }, 400);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM meds WHERE id = ?1").bind(id),
    env.DB.prepare("DELETE FROM med_acks WHERE med_id = ?1").bind(id),
    bumpRev(env.DB),
  ]);
  return json({ ok: true });
}

export const onRequestPut = safe(update);
export const onRequestDelete = safe(remove);
