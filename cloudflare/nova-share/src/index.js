const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_UPLOAD_BYTES = 90 * 1024 * 1024;
const SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
      ...extra
    }
  });
}

function makeCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400"
      }
    });

    if (url.pathname === "/api/share" && request.method === "POST") {
      const declaredLength = Number(request.headers.get("content-length") || 0);
      if (declaredLength > MAX_UPLOAD_BYTES) return json({ error: "This pack is larger than NOVA Share's 90 MB upload limit." }, 413);
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/zip")) {
        return json({ error: "NOVA Share accepts ZIP modpack archives only." }, 415);
      }

      const body = await request.arrayBuffer();
      if (!body.byteLength || body.byteLength > MAX_UPLOAD_BYTES) {
        return json({ error: "The archive is empty or exceeds the 90 MB upload limit." }, 413);
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();
        const key = `shares/${code}.zip`;
        const existing = await env.NOVA_SHARES.head(key);
        if (existing) continue;
        const expiresAt = Math.floor(Date.now() / 1000) + SHARE_TTL_SECONDS;
        await env.NOVA_SHARES.put(key, body, {
          httpMetadata: { contentType: "application/zip" },
          customMetadata: { expiresAt: String(expiresAt), bytes: String(body.byteLength) }
        });
        return json({ code, expiresAt, bytes: body.byteLength });
      }
      return json({ error: "Could not reserve a unique share code. Please try again." }, 503);
    }

    const match = url.pathname.match(/^\/api\/share\/([A-HJ-NP-Z2-9]{8})$/);
    if (match && request.method === "GET") {
      const code = match[1];
      const key = `shares/${code}.zip`;
      const object = await env.NOVA_SHARES.get(key);
      if (!object) return json({ error: "That share code does not exist or has expired." }, 404);
      const expiresAt = Number(object.customMetadata?.expiresAt || 0);
      if (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000)) {
        await env.NOVA_SHARES.delete(key);
        return json({ error: "That share code has expired." }, 410);
      }
      return new Response(object.body, {
        headers: {
          "content-type": "application/zip",
          "content-length": String(object.size),
          "content-disposition": `attachment; filename="nova-share-${code}.zip"`,
          "cache-control": "no-store",
          "access-control-allow-origin": "*"
        }
      });
    }

    return json({ error: "NOVA Share endpoint not found." }, 404);
  }
};
