// Tiny stateless session: an HMAC-signed token stored in an HttpOnly cookie.
// Edge-compatible (uses Web Crypto), so it works in middleware and route handlers.

export const COOKIE = "budgetproof_session";
const enc = new TextEncoder();
// Web Crypto types want BufferSource; our Uint8Arrays are compatible at runtime.
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", bs(enc.encode(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function sign(payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, bs(enc.encode(body)));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verify(token: string | undefined, secret: string): Promise<Record<string, unknown> | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, bs(unb64url(sig)), bs(enc.encode(body)));
    if (!ok) return null;
    const obj = JSON.parse(new TextDecoder().decode(unb64url(body)));
    if (typeof obj.exp === "number" && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}
