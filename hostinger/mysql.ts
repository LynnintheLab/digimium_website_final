import { createPool, type Pool } from "mysql2/promise";

// Next can load multiple server bundles in one process. Reuse the connection pool.
const pools = globalThis as typeof globalThis & { digimiumMySqlPool?: Pool };

export function getPool(): Pool {
  if (pools.digimiumMySqlPool) return pools.digimiumMySqlPool;

  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (!DB_NAME || !DB_USER || !DB_PASSWORD) {
    throw new Error("Set DB_NAME, DB_USER and DB_PASSWORD in the Hostinger application environment.");
  }
  const port = Number(DB_PORT || "3306");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be a valid TCP port.");
  }
  pools.digimiumMySqlPool = createPool({
    host: DB_HOST || "127.0.0.1",
    port,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    charset: "utf8mb4",
    connectTimeout: 8000,
    connectionLimit: 4,
    queueLimit: 32,
    supportBigNumbers: true,
  });
  return pools.digimiumMySqlPool;
}
