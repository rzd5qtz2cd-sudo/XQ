// GET  /api/pager/messages?limit=20[&before=<id>]  管理员/板子都可读，按 id 倒序（新→旧）
// POST /api/pager/messages  {"text":"..."}          仅管理员，纯文本，最多 100 个字符
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const MAX_CHARS = 100;
const KEEP_ROWS = 500; // 服务器最多保留最近多少条

async function getList({ request, env }) {
  const u = new URL(request.url);
  let limit = parseInt(u.searchParams.get("limit") || "20", 10);
  if (!(limit > 0)) limit = 20;
  limit = Math.min(limit, 200);
  const before = parseInt(u.searchParams.get("before") || "0", 10) || 0;

  const stmt =
    before > 0
      ? env.DB.prepare("SELECT id, text, ts FROM messages WHERE id < ?1 ORDER BY id DESC LIMIT ?2").bind(before, limit + 1)
      : env.DB.prepare("SELECT id, text, ts FROM messages ORDER BY id DESC LIMIT ?1").bind(limit + 1);

  const { results } = await stmt.all();
  const more = results.length > limit;
  if (more) results.pop();
  return json({ now: Math.floor(Date.now() / 1000), more, messages: results });
}

async function postMsg({ request, env, data }) {
  if (data.role !== "admin") return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  let text = typeof body.text === "string" ? body.text : "";
  // 纯文本：控制字符/换行统一变成空格，合并连续空白
  text = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  const n = [...text].length; // 按字符（不是字节）计数
  if (n < 1) return json({ error: "empty" }, 400);
  if (n > MAX_CHARS) return json({ error: "too long (max " + MAX_CHARS + ")" }, 400);

  const ts = Math.floor(Date.now() / 1000);
  const r = await env.DB.prepare("INSERT INTO messages (text, ts) VALUES (?1, ?2)").bind(text, ts).run();
  const id = r.meta.last_row_id;
  await env.DB.prepare("DELETE FROM messages WHERE id <= ?1").bind(id - KEEP_ROWS).run();
  return json({ id, ts });
}

const safe = (fn) => async (ctx) => {
  try { return await fn(ctx); }
  catch (e) { return json({ error: "server error: " + (e && e.message ? e.message : String(e)) }, 500); }
};
export const onRequestGet = safe(getList);
export const onRequestPost = safe(postMsg);
