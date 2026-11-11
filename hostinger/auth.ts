import { createHmac, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2/promise";
import { isSameOriginMutation, type AdminCheck } from "../lib/admin-auth-policy";
import { getPool } from "./mysql";
import {
  challengeLifetimeSeconds, claimDelivery, isChallengePending, redeemChallenge,
  saveDeliveredChallenge, sessionLifetimeSeconds,
} from "./otp-store";

export const emailCodeLogin: boolean = true;
export const signInPath = "/admin/login";
export const signOutPath = "/admin/logout";
const verifyPath = signInPath + "?step=verify";
const privateHeaders = { "Cache-Control": "private, no-store" };

function readConfig() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const secret = process.env.ADMIN_AUTH_SECRET?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!email || !/^[^\s@,;<>]+@[^\s@,;<>]+$/.test(email) || !secret || secret.length < 32 || !apiKey || !from) return null;
  let url: URL;
  try { url = new URL(process.env.APP_ORIGIN ?? ""); } catch { return null; }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
  const secure = url.protocol === "https:";
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!secure && !(local && url.protocol === "http:")) return null;
  const prefix = secure ? "__Host-digimium_" : "digimium_local_";
  return { email, secret, apiKey, from, origin: url.origin, secure, sessionCookie: prefix + "admin", challengeCookie: prefix + "challenge" };
}
type Config = NonNullable<ReturnType<typeof readConfig>>;

export function isAllowedMutation(request: Request): boolean {
  const config = readConfig();
  return config !== null && isSameOriginMutation(request, config.origin);
}

// A database backup alone cannot reveal a six-digit code. Rotating the secret,
// owner email or origin also invalidates every outstanding code and session.
function digest(config: Config, purpose: "session" | "challenge" | "code", ...values: string[]) {
  return createHmac("sha256", config.secret)
    .update(JSON.stringify([purpose, config.origin, config.email, ...values])).digest();
}

async function readToken(name: string) {
  const token = (await cookies()).get(name)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function logFailure(operation: string, error: unknown) {
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "";
  console.error(operation, /^[A-Z_0-9]{1,64}$/.test(code) ? code : "Operation failed");
}

export async function checkAdmin(): Promise<AdminCheck> {
  const config = readConfig();
  if (!config) return { ok: false, status: 503, message: "Admin sign-in is temporarily unavailable." };
  const token = await readToken(config.sessionCookie);
  if (token) {
    try {
      const [rows] = await getPool().execute<RowDataPacket[]>(
        "SELECT 1 FROM digimium_admin_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()",
        [digest(config, "session", token)],
      );
      if (rows.length) return { ok: true, user: { userId: "owner", email: config.email, fullName: null, displayName: config.email } };
    } catch (error) {
      logFailure("Admin session lookup failed", error);
      return { ok: false, status: 503, message: "Admin sign-in is temporarily unavailable." };
    }
  }
  return { ok: false, status: 401, message: "Sign in to manage the catalog." };
}

function cookie(config: Config, name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secure ? "; Secure" : ""}`;
}

function go(path: string, ...setCookies: string[]) {
  const headers = new Headers({ ...privateHeaders, Location: path });
  for (const value of setCookies) headers.append("Set-Cookie", value);
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

function expired(config: Config) {
  return go(signInPath + "?error=expired", cookie(config, config.challengeCookie, "", 0));
}

async function deliverCode(config: Config, code: string) {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [config.email],
        subject: "Your Digimium admin sign-in code",
        text: `Your Digimium admin sign-in code is ${code}. It expires in 10 minutes. Enter it in the browser where you requested it. If you did not request a code, you can ignore this email.`,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error("Resend rejected the admin sign-in email", response.status);
      await response.body?.cancel();
      return false;
    }
    const result = await response.json();
    return typeof result === "object" && result !== null && "id" in result && typeof result.id === "string" && result.id.length > 0;
  } catch (error) {
    logFailure("Resend delivery failed", error);
    return false;
  }
}

async function requestCode(config: Config, form: URLSearchParams) {
  const token = await readToken(config.challengeCookie);
  const previousHash = token ? digest(config, "challenge", token) : null;
  const isPending = previousHash !== null && await isChallengePending(previousHash);
  const email = form.get("email")?.trim().toLowerCase();
  const newToken = randomBytes(32).toString("base64url");
  const pendingCookie = cookie(config, config.challengeCookie, newToken, challengeLifetimeSeconds);
  if (email === undefined && !isPending) return expired(config);
  if (email !== undefined && email !== config.email) return go(verifyPath, pendingCookie);

  const errorPrefix = isPending ? verifyPath + "&error=" : signInPath + "?error=";
  if (!await claimDelivery()) return go(errorPrefix + "retry");
  const code = randomInt(1000000).toString().padStart(6, "0");
  if (!await deliverCode(config, code)) return go(errorPrefix + "delivery");
  const saved = await saveDeliveredChallenge(
    digest(config, "challenge", newToken), digest(config, "code", newToken, code), isPending ? previousHash : null,
  );
  return saved ? go(verifyPath, pendingCookie) : expired(config);
}

async function verifyCode(config: Config, code: string) {
  const token = await readToken(config.challengeCookie);
  if (!token) return expired(config);
  const newSession = randomBytes(32).toString("base64url");
  const result = await redeemChallenge(
    digest(config, "challenge", token), digest(config, "code", token, code), digest(config, "session", newSession),
  );
  if (result === "expired") return expired(config);
  if (result === "code") return go(verifyPath + "&error=code");
  return go("/admin", cookie(config, config.sessionCookie, newSession, sessionLifetimeSeconds), cookie(config, config.challengeCookie, "", 0));
}

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
    switch (form.get("action")) {
      case "request": return await requestCode(config, form);
      case "verify": return await verifyCode(config, (form.get("code") ?? "").trim());
      default: return fail("Choose a sign-in action.", 400);
    }
  } catch (error) {
    logFailure("Admin sign-in failed", error);
    return go(signInPath + "?error=unavailable");
  }
}

export async function endSession(request: Request) {
  const config = readConfig();
  if (!config) return fail("Admin sign-in is temporarily unavailable.", 503);
  if (!isSameOriginMutation(request, config.origin)) return fail("Sign out from the website's own address.", 403);
  try {
    const token = await readToken(config.sessionCookie);
    if (token) {
      await getPool().execute("DELETE FROM digimium_admin_sessions WHERE token_hash = ?", [digest(config, "session", token)]);
    }
    const pending = await readToken(config.challengeCookie);
    if (pending) {
      await getPool().execute("DELETE FROM digimium_otp_challenges WHERE challenge_hash = ?", [digest(config, "challenge", pending)]);
    }
  } catch (error) {
    logFailure("Admin sign-out failed", error);
    return fail("Sign-out did not complete. Please try again.", 503);
  }
  return go(signInPath, cookie(config, config.sessionCookie, "", 0), cookie(config, config.challengeCookie, "", 0));
}
