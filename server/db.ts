import pg from "pg";

// Single shared connection pool to the local Postgres (RDS later — same driver,
// just a different DATABASE_URL). Keep numeric columns as JS numbers rather than
// strings for the common integer/float types the app uses.
const { Pool, types } = pg;

// int8 (bigint) -> number is fine for our counts; numeric stays string to avoid
// precision loss, callers coerce where needed.
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL — set it in .env.local");
}

export const pool = new Pool({ connectionString, max: 10 });

// Thin query helper.
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
