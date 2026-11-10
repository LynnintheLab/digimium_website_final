import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { isSameOriginMutation, type AdminCheck } from "../lib/admin-auth-policy";
import { getPool } from "./mysql";

export const passwordLogin: boolean = true;
export const signInPath = "/admin/login";
export const signOutPath = "/admin/logout";
const sessionLifetimeSeconds = 8 * 60 * 60;
const privateHeaders = { "Cache-Control": "private, no-store" };

function readConfig() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 16 || password.length > 256) return null;
  let url: URL;
  try { url = new URL(process.env.APP_ORIGIN ?? ""); } catch { return null; }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
  const secure = url.protocol === "https:";
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!secure && !(local && url.protocol === "http:")) return null;
  return { email, password, origin: url.origin, secure, cookie: secure ? "__Host-digimium_admin" : "digimium_local_admin" };
}
type Config = NonNullable<ReturnType<typeof readConfig>>;

export function isAllowedMutation(request: Request): boolean {
  const config = readConfig();
  return config !== null && isSameOriginMutation(request, config.origin);
}

// Binding the opaque random token to the email, password and origin invalidates
// existing sessions when the owner rotates credentials or changes domains.
function tokenHash(token: string, config: Config): Buffer {
  return createHmac("sha256", config.password)
    .update(JSON.stringify([config.origin, config.email, token])).digest();
}

async function requestToken(config: Config) {
  const token = (await cookies()).get(config.cookie)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function checkAdmin(): Promise<AdminCheck> {
  const config = readConfig();
  if (!config) return { ok: false, status: 503, message: "Admin sign-in is temporarily unavailable." };
  const token = await requestToken(config);
  if (token) {
    try {
      const [rows] = await getPool().execute<RowDataPacket[]>(
        "SELECT 1 FROM digimium_admin_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()",
        [tokenHash(token, config)],
      );
      if (rows.length) return { ok: true, user: { userId: "owner", email: config.email, fullName: null, displayName: config.email } };
    } catch {
      return { ok: false, status: 503, message: "Admin sign-in is temporarily unavailable." };
    }
  }
  return { ok: false, status: 401, message: "Sign in to manage the catalog." };
}

function sessionCookie(config: Config, value: string, maxAge: number) {
  return `${config.cookie}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secure ? "; Secure" : ""}`;
}

function go(path: string, cookie?: string) {
  const headers = new Headers({ ...privateHeaders, Location: path });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function fail(message: string, status: number) {
  return new Response(message, { status, headers: privateHeaders });
}

async function readForm(request: Request) {
  if (!request.body || Number(request.headers.get("content-length")) > 8192) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let data = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 8192) { await reader.cancel(); return null; }
      data += decoder.decode(part.value, { stream: true });
    }
    return new URLSearchParams(data + decoder.decode());
  } finally { reader.releaseLock(); }
}

// A bounded, shared attempt budget protects the single owner account even when
// multiple app processes handle requests. Client-supplied IP headers are never trusted.
async function claimLoginAttempt() {
  const pool = getPool();
  const windowId = Math.floor(Date.now() / 300000);
  await pool.execute("DELETE FROM digimium_login_limits WHERE window_id < ?", [windowId]);
  await pool.execute("INSERT IGNORE INTO digimium_login_limits (window_id) VALUES (?)", [windowId]);
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE digimium_login_limits SET attempts = attempts + 1 WHERE window_id = ? AND attempts < 20",
    [windowId],
  );
  return result.affectedRows === 1;
}

function digest(value: string) { return createHash("sha256").update(value).digest(); }

export async function createSession(request: Request) {
  const config = readConfig();
  if (!config) return fail("Admin sign-in is temporarily unavailable.", 503);
  if (!isSameOriginMutation(request, config.origin)) return fail("Sign in from the website's own address.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    return fail("Submit the sign-in form.", 415);
  }
  try {
    const form = await readForm(request);
    if (!form) return fail("The sign-in form is too large or empty.", 400);
    if (!await claimLoginAttempt()) return go(signInPath + "?error=retry");
    const email = (form.get("email") ?? "").trim().toLowerCase();
    const password = form.get("password") ?? "";
    const emailMatches = timingSafeEqual(digest(email), digest(config.email));
    const passwordMatches = timingSafeEqual(digest(password), digest(config.password));
    if (!emailMatches || !passwordMatches) return go(signInPath + "?error=credentials");
    const token = randomBytes(32).toString("base64url");
    const pool = getPool();
    await pool.execute("DELETE FROM digimium_admin_sessions WHERE expires_at <= UTC_TIMESTAMP()");
    await pool.execute(
      "INSERT INTO digimium_admin_sessions (token_hash, expires_at) VALUES (?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))",
      [tokenHash(token, config)],
    );
    return go("/admin", sessionCookie(config, token, sessionLifetimeSeconds));
  } catch {
    return go(signInPath + "?error=unavailable");
  }
}

export async function endSession(request: Request) {
  const config = readConfig();
  if (!config) return fail("Admin sign-in is temporarily unavailable.", 503);
  if (!isSameOriginMutation(request, config.origin)) return fail("Sign out from the website's own address.", 403);
  const token = await requestToken(config);
  if (token) {
    try {
      await getPool().execute("DELETE FROM digimium_admin_sessions WHERE token_hash = ?", [tokenHash(token, config)]);
    } catch {
      return fail("Sign-out did not complete. Please try again.", 503);
    }
  }
  return go(signInPath, sessionCookie(config, "", 0));
}
