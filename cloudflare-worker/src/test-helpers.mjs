// Helper test worker: adapter D1 berbasis node:sqlite (Node >= 22.5) dan mock
// binding R2 in-memory, sehingga test menjalankan SQL asli dari d1/*.sql.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { signAccessToken } from './auth.js';
import { createProfile } from './db.js';

const SCHEMA_SQL = fs.readFileSync(path.join(import.meta.dirname, '..', 'd1', '0001_schema.sql'), 'utf8');
const SEED_SQL = fs.readFileSync(path.join(import.meta.dirname, '..', 'd1', '0002_seed.sql'), 'utf8');

export function createD1Adapter({ seed = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(SCHEMA_SQL);
  if (seed) sqlite.exec(SEED_SQL);

  function prepare(sql) {
    let bound = [];
    const statement = {
      bind(...params) {
        bound = params;
        return statement;
      },
      async all() {
        const results = sqlite.prepare(sql).all(...bound);
        return { success: true, results, meta: { changes: 0 } };
      },
      async first(column) {
        const row = sqlite.prepare(sql).get(...bound) || null;
        if (!row) return null;
        return column ? row[column] : row;
      },
      async run() {
        const info = sqlite.prepare(sql).run(...bound);
        return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
      }
    };
    return statement;
  }

  return {
    sqlite,
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

export function createR2Mock() {
  const objects = new Map();

  async function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return new Uint8Array(await new Response(value).arrayBuffer());
  }

  return {
    objects,
    async put(key, value, options = {}) {
      objects.set(key, { bytes: await toBytes(value), httpMetadata: options.httpMetadata || {} });
      return { key };
    },
    async get(key) {
      const entry = objects.get(key);
      if (!entry) return null;
      return {
        key,
        body: new Response(entry.bytes).body,
        httpMetadata: entry.httpMetadata,
        async arrayBuffer() {
          return entry.bytes.slice().buffer;
        },
        async text() {
          return new TextDecoder().decode(entry.bytes);
        }
      };
    },
    async delete(keys) {
      for (const key of [].concat(keys)) objects.delete(key);
    },
    async list({ prefix = '' } = {}) {
      const matched = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      return { objects: matched.map((key) => ({ key })), truncated: false };
    }
  };
}

export function createTestEnv(overrides = {}) {
  return {
    DB: createD1Adapter(),
    ASSETS: createR2Mock(),
    AUTH_JWT_SECRET: 'test-jwt-secret',
    WORKER_BASE_URL: 'https://worker.example',
    APP_BASE_URL: 'https://frontend.example',
    SIGNUP_BONUS_HASH_SALT: 'test-bonus-salt',
    ...overrides
  };
}

export async function createTestUser(env, { id = crypto.randomUUID(), email, fullName = 'User Test', role = 'user', isUnlimited = false, isActive = true, passwordHash = null, salt = null, authProvider = 'password' } = {}) {
  return createProfile(env, {
    id,
    email: email || `${id}@example.com`,
    fullName,
    role,
    isUnlimited,
    isActive,
    passwordHash,
    salt,
    authProvider
  });
}

export async function authHeaderFor(env, profile) {
  return { Authorization: `Bearer ${await signAccessToken(env, profile)}` };
}