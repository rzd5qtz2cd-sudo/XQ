// 服药提醒：共用函数（此文件本身不是接口）
export const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export const MAX_MEDS = 20;
const clean = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "");
const len = (s) => [...s].length;

export function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// 校验并规范化一条药物提醒。成功返回 {med}，失败返回 {err}
export function normalize(b) {
  const name = clean(b.name), how = clean(b.how), dose = clean(b.dose);
  if (len(name) < 1 || len(name) > 24) return { err: "药物名称需 1~24 个字" };
  if (len(how) > 30) return { err: "用法最多 30 个字" };
  if (len(dose) > 20) return { err: "用量最多 20 个字" };

  let times = Array.isArray(b.times) ? b.times : [];
  times = [...new Set(times.filter((t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort();
  if (times.length < 1 || times.length > 8) return { err: "提醒时间需 1~8 个（格式 HH:MM）" };

  const kind = b.kind;
  if (!["d", "w", "i"].includes(kind)) return { err: "重复方式不正确" };
  let wmask = 127, every = 1;
  if (kind === "w") {
    wmask = parseInt(b.wmask, 10);
    if (!(wmask >= 1 && wmask <= 127)) return { err: "请至少选择一个星期" };
  }
  if (kind === "i") {
    every = parseInt(b.every, 10);
    if (!(every >= 2 && every <= 365)) return { err: "间隔天数需在 2~365 之间" };
  }
  if (!validDate(b.start)) return { err: "开始日期不正确" };
  const end = b.end ? b.end : "";
  if (end && (!validDate(end) || end < b.start)) return { err: "结束日期不能早于开始日期" };

  return { med: { name, how, dose, times, kind, wmask, every, start: b.start, end, enabled: b.enabled === false || b.enabled === 0 ? 0 : 1 } };
}

export const rowToMed = (r) => ({
  id: r.id, name: r.name, how: r.how, dose: r.dose,
  times: r.times.split(","), kind: r.kind, wmask: r.wmask, every: r.every_n,
  start: r.d_start, end: r.d_end, enabled: !!r.enabled, upd: r.upd,
});

export const bumpRev = (DB) => DB.prepare("UPDATE meta SET v = v + 1 WHERE k = 'medrev'");
export async function getRev(DB) {
  const r = await DB.prepare("SELECT v FROM meta WHERE k = 'medrev'").first();
  return r ? r.v : 1;
}

export const safe = (fn) => async (ctx) => {
  try { return await fn(ctx); }
  catch (e) { return json({ error: "server error: " + (e && e.message ? e.message : String(e)) }, 500); }
};
