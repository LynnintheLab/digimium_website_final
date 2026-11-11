import { timingSafeEqual } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "./mysql";

export const sessionLifetimeSeconds = 180 * 24 * 60 * 60;
export const challengeLifetimeSeconds = 10 * 60;

async function inTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// One shared delivery budget for the owner's mailbox across all app processes.
export async function claimDelivery(): Promise<boolean> {
  const pool = getPool();
  await pool.execute(
    "INSERT IGNORE INTO digimium_otp_send_limit (id, window_start) VALUES (1, UTC_TIMESTAMP())",
  );
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE digimium_otp_send_limit
     SET sends = IF(window_start <= UTC_TIMESTAMP() - INTERVAL 1 HOUR, 1, sends + 1),
         window_start = IF(window_start <= UTC_TIMESTAMP() - INTERVAL 1 HOUR, UTC_TIMESTAMP(), window_start),
         last_sent_at = UTC_TIMESTAMP()
     WHERE id = 1 AND (last_sent_at IS NULL OR last_sent_at <= UTC_TIMESTAMP() - INTERVAL 60 SECOND)
       AND (sends < 5 OR window_start <= UTC_TIMESTAMP() - INTERVAL 1 HOUR)`,
  );
  return result.affectedRows === 1;
}

export async function isChallengePending(challengeHash: Buffer): Promise<boolean> {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT 1 FROM digimium_otp_challenges WHERE challenge_hash = ? AND expires_at > UTC_TIMESTAMP() AND attempts_left > 0",
    [challengeHash],
  );
  return rows.length === 1;
}

export async function saveDeliveredChallenge(challengeHash: Buffer, codeHash: Buffer, previousHash: Buffer | null) {
  const pool = getPool();
  await pool.execute("DELETE FROM digimium_otp_challenges WHERE expires_at <= UTC_TIMESTAMP()");
  await pool.execute("DELETE FROM digimium_admin_sessions WHERE expires_at <= UTC_TIMESTAMP()");
  return inTransaction(async (connection) => {
    if (previousHash) {
      const [old] = await connection.execute<ResultSetHeader>(
        "DELETE FROM digimium_otp_challenges WHERE challenge_hash = ? AND expires_at > UTC_TIMESTAMP() AND attempts_left > 0",
        [previousHash],
      );
      if (!old.affectedRows) return false;
    }
    await connection.execute(
      "INSERT INTO digimium_otp_challenges (challenge_hash, code_hash, expires_at) VALUES (?, ?, TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP()))",
      [challengeHash, codeHash, challengeLifetimeSeconds],
    );
    return true;
  });
}

type ChallengeRow = RowDataPacket & { code_hash: Buffer; attempts_left: number };

export async function redeemChallenge(challengeHash: Buffer, codeHash: Buffer, sessionHash: Buffer) {
  return inTransaction(async (connection) => {
    // Lock a single challenge so a code can create at most one remembered session.
    const [rows] = await connection.execute<ChallengeRow[]>(
      `SELECT code_hash, attempts_left FROM digimium_otp_challenges
       WHERE challenge_hash = ? AND expires_at > UTC_TIMESTAMP() AND attempts_left > 0 FOR UPDATE`,
      [challengeHash],
    );
    const row = rows[0];
    if (!row) return "expired";
    if (!timingSafeEqual(row.code_hash, codeHash)) {
      await connection.execute(
        "UPDATE digimium_otp_challenges SET attempts_left = attempts_left - 1 WHERE challenge_hash = ?",
        [challengeHash],
      );
      return row.attempts_left === 1 ? "expired" : "code";
    }
    await connection.execute("DELETE FROM digimium_otp_challenges WHERE challenge_hash = ?", [challengeHash]);
    await connection.execute(
      "INSERT INTO digimium_admin_sessions (token_hash, expires_at) VALUES (?, TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP()))",
      [sessionHash, sessionLifetimeSeconds],
    );
    return "verified";
  });
}
