import mysql from 'mysql2/promise';
import { config } from './config.js';

// A DB adapter is { query(text, params), transaction(fn(client)), end() }.
// Every query resolves to { rows, rowCount, affectedRows }; SQL uses `?` placeholders.
let adapter = null;

const shape = (result) => {
  const isRows = Array.isArray(result);
  return { rows: isRows ? result : [], rowCount: isRows ? result.length : 0, affectedRows: isRows ? 0 : result.affectedRows };
};

const wrap = (conn) => ({ query: async (text, params) => shape((await conn.query(text, params))[0]) });

export function createPool({ database = config.db.database, multipleStatements = false } = {}) {
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: database ?? undefined,
    connectionLimit: config.dbPoolMax,
    charset: 'utf8mb4',
    timezone: 'Z',
    multipleStatements,
  });
  // TIMESTAMP columns and NOW() are UTC, matching the JS Dates sent over the wire.
  pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
  return pool;
}

function createMysqlAdapter() {
  const pool = createPool();
  return {
    ...wrap(pool),
    async transaction(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await fn(wrap(conn));
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
    end: () => pool.end(),
  };
}

export function useAdapter(custom) {
  adapter = custom;
}

const current = () => (adapter ??= createMysqlAdapter());

export const query = (text, params) => current().query(text, params);
export const transaction = (fn) => current().transaction(fn);
export const closeDb = () => adapter?.end?.();
