import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { isSameOriginMutation } from "../lib/admin-auth-policy";
import { getPool } from "./mysql";
import { CommerceError, readCommerceJson } from "../lib/commerce-http";

export type Customer = { id: string; name: string; email: string };
const sessionSeconds = 30 * 24 * 60 * 60;
let schema: Promise<void> | undefined;

export function ensureCustomerSchema(): Promise<void> {
  if (!schema) {
    schema = (async () => {
      try {
        await getPool().query(`SELECT 1 FROM digimium_customers, digimium_customer_sessions, digimium_customer_auth_limits LIMIT 0`);
        return;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ER_NO_SUCH_TABLE")) throw error;
      }
      const sql = await readFile(join(process.cwd(), "hostinger", "customer-auth-schema.sql"), "utf8");
      for (const statement of sql.split(";").filter(part => part.trim())) {
        await getPool().query(statement);
      }
    })().catch(error => { schema = undefined; throw error; });
  }
  return schema;
}

function site() {
  let url: URL;
  try { url = new URL(process.env.APP_ORIGIN ?? ""); } catch { return null; }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
  const secure = url.protocol === "https:";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!secure && !(local && url.protocol === "http:")) return null;
  return { origin: url.origin, secure, cookie: secure ? "__Host-digimium_customer" : "digimium_local_customer" };
}

export function customerMutationAllowed(request: Request): boolean {
  const config = site();
  return !!config && isSameOriginMutation(request, config.origin);
}

function sessionToken(request: Request, name: string) {
  const field = (request.headers.get("cookie") ?? "").split(";")
    .map(part => part.trim()).find(part => part.startsWith(name + "="));
  const token = field?.slice(name.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export async function currentCustomer(request: Request): Promise<Customer | null> {
  const config = site();
  const token = config && sessionToken(request, config.cookie);
  if (!token) return null;
  await ensureCustomerSchema();
  const [rows] = await getPool().execute<(Customer & RowDataPacket)[]>(
    `SELECT c.id, c.name, c.email FROM digimium_customer_sessions s
     JOIN digimium_customers c ON c.id = s.customer_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()`, [digest(token)],
  );
  return rows[0] ?? null;
}

type Input = { action: "login" | "register"; email: string; name: string; password: string };

async function readCredentials(request: Request): Promise<Input | null> {
  const body = await readCommerceJson(request, 4096);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { email: rawEmail, name: rawName, password, action } = body as Record<string, unknown>;
  if (action !== "register" && action !== "login") return null;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (email.length > 254 || !/^[^\s@,;<>\p{Cc}]+@[^\s@,;<>\p{Cc}]+\.[^\s@,;<>\p{Cc}]+$/u.test(email)) return null;
  if (typeof password !== "string" || !password.length || password.length > 256) return null;
  if (action === "register" && (!name || name.length > 100 || /\p{Cc}/u.test(name) || password.length < 10)) return null;
  return { action, email, name, password };
}

function passwordKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await passwordKey(password, salt);
  return ["scrypt-v1", salt.toString("hex"), key.toString("hex")].join("$");
}

async function matchesPassword(password: string, encoded?: string) {
  const match = /^scrypt-v1\$([\da-f]{32})\$([\da-f]{64})$/.exec(encoded ?? "");
  // A missing account takes the same scrypt work as a valid one.
  const salt = match ? Buffer.from(match[1], "hex") : Buffer.alloc(16);
  const expected = match ? Buffer.from(match[2], "hex") : Buffer.alloc(32);
  const key = await passwordKey(password, salt);
  return timingSafeEqual(key, expected) && !!match;
}

async function claimAttempt(scope: string, max: number, bucket: number) {
  const pool = getPool();
  const key = digest(scope);
  await pool.execute(
    "INSERT IGNORE INTO digimium_customer_auth_limits (bucket, scope_hash) VALUES (?, ?)", [bucket, key],
  );
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE digimium_customer_auth_limits SET attempts = attempts + 1 WHERE bucket = ? AND scope_hash = ? AND attempts < ?",
    [bucket, key, max],
  );
  return result.affectedRows === 1;
}

async function withinLimit(request: Request, input: Input) {
  const bucket = Math.floor(Date.now() / 900000);
  // Cap total hash work even if a proxy does not supply a trustworthy address.
  if (!await claimAttempt("all", 900, bucket)) return false;
  const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (ip && isIP(ip) && !await claimAttempt(input.action + ":ip:" + ip, input.action === "register" ? 20 : 100, bucket)) return false;
  if (!await claimAttempt(input.action + ":email:" + input.email, 12, bucket)) return false;
  await getPool().execute("DELETE FROM digimium_customer_auth_limits WHERE bucket < ? LIMIT 100", [bucket - 1]);
  return true;
}

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function reply(data: unknown, status = 200, cookie?: string) {
  const headers = new Headers(privateHeaders);
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(data, { status, headers });
}

export async function customerSession(request: Request): Promise<Response> {
  const config = site();
  if (!config) return reply({ error: "unavailable" }, 503);
  if (request.method !== "GET" && !isSameOriginMutation(request, config.origin)) return reply({ error: "origin" }, 403);
  const cookie = (token: string, age: number) =>
    `${config.cookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${config.secure ? "; Secure" : ""}`;
  try {
    if (request.method === "GET") return reply({ customer: await currentCustomer(request) });
    const oldToken = sessionToken(request, config.cookie);
    if (request.method === "DELETE") {
      if (oldToken) {
        await ensureCustomerSchema();
        await getPool().execute("DELETE FROM digimium_customer_sessions WHERE token_hash = ?", [digest(oldToken)]);
      }
      return reply({ customer: null }, 200, cookie("", 0));
    }
    const input = await readCredentials(request);
    if (!input) return reply({ error: "invalid" }, 400);
    await ensureCustomerSchema();
    if (!await withinLimit(request, input)) return reply({ error: "rate_limited" }, 429);

    const creating = input.action === "register";
    let customer: Customer;
    let passwordHash: string | null = null;
    if (creating) {
      passwordHash = await hashPassword(input.password);
      customer = { id: randomUUID(), name: input.name, email: input.email };
    } else {
      const [rows] = await getPool().execute<(Customer & RowDataPacket & { password_hash: string })[]>(
        "SELECT id, name, email, password_hash FROM digimium_customers WHERE email = ?", [input.email],
      );
      const existing = rows[0];
      if (!await matchesPassword(input.password, existing?.password_hash) || !existing) return reply({ error: "credentials" }, 401);
      customer = { id: existing.id, name: existing.name, email: existing.email };
    }

    await getPool().execute("DELETE FROM digimium_customer_sessions WHERE expires_at <= UTC_TIMESTAMP() LIMIT 100");
    const token = randomBytes(32).toString("base64url");
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      if (creating) {
        await connection.execute("INSERT INTO digimium_customers (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))",
          [customer.id, customer.name, customer.email, passwordHash]);
      }
      if (oldToken) await connection.execute("DELETE FROM digimium_customer_sessions WHERE token_hash = ?", [digest(oldToken)]);
      await connection.execute(
        "INSERT INTO digimium_customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))",
        [digest(token), customer.id, sessionSeconds],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (creating && error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY") {
        return reply({ error: "registration" }, 409);
      }
      throw error;
    } finally { connection.release(); }

    return reply({ customer }, creating ? 201 : 200, cookie(token, sessionSeconds));
  } catch (error) {
    if (error instanceof CommerceError) return reply({ error: "invalid" }, error.status);
    const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "";
    console.error("Customer session failed", /^[A-Z_0-9]{1,64}$/.test(code) ? code : "Unavailable");
    return reply({ error: "unavailable" }, 503);
  }
}
