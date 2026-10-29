// DELETE /api/pager/messages/:id  仅管理员
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function onRequestDelete({ params, env, data }) {
  if (data.role !== "admin") return json({ error: "forbidden" }, 403);
  const id = parseInt(params.id, 10);
  if (!(id > 0)) return json({ error: "bad id" }, 400);
  const r = await env.DB.prepare("DELETE FROM messages WHERE id = ?1").bind(id).run();
  return json({ deleted: r.meta.changes || 0 });
}
