// 认证中间件：作用于 /api/pager/ 下所有接口
//   网页端：请求头 X-Admin-Password（可读、发送、删除）
//   板子端：请求头 X-Device-Token  （只读）
const enc = new TextEncoder();

async function sha(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
// 比较两个字符串（先哈希再逐字节比较，避免时序泄露）
async function same(a, b) {
  if (!a || !b) return false;
  const x = await sha(a), y = await sha(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
function dec(s) {
  if (!s) return "";
  try { return decodeURIComponent(s); } catch { return s; }
}

export async function onRequest(ctx) {
  const { request, env, data } = ctx;
  const json = (o, s) =>
    new Response(JSON.stringify(o), {
      status: s,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });

  if (!env.DB || !env.ADMIN_PASSWORD || !env.DEVICE_TOKEN) {
    return json({ error: "server not configured (DB / ADMIN_PASSWORD / DEVICE_TOKEN)" }, 500);
  }

  let role = null;
  if (await same(dec(request.headers.get("X-Admin-Password")), env.ADMIN_PASSWORD)) role = "admin";
  else if (await same(request.headers.get("X-Device-Token"), env.DEVICE_TOKEN)) role = "device";

  if (!role) return json({ error: "unauthorized" }, 401);
  data.role = role;
  return ctx.next();
}
