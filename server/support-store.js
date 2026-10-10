import { sorted } from '../core/collections.js';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { database, transaction } from './database.js';
import { PairingError } from './errors.js';
/** Account-scoped encrypted support history and Discord delivery checkpoints. */
export class SupportStore {
  /** @param {string|import('./database.js').SqlDatabase} path @param {{seal:(plain:Uint8Array,aad:string)=>Uint8Array,open:(value:Uint8Array,aad:string)=>Uint8Array}} codec */
  constructor(path, codec) {
    this.db = database(path);
    this.codec = codec;
    this.db.exec(`PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS support_conversations(subject TEXT PRIMARY KEY,id TEXT UNIQUE,thread TEXT,cursor TEXT,agent_access INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS support_messages(sequence INTEGER PRIMARY KEY AUTOINCREMENT,subject TEXT,id TEXT,role TEXT,created TEXT,delivery TEXT,value BLOB,UNIQUE(subject,id));
      CREATE INDEX IF NOT EXISTS support_owner ON support_messages(subject,sequence);`);
  }
  /** @param {string} subject */
  conversation(subject) {
    return this.db.prepare('SELECT * FROM support_conversations WHERE subject=?').get(subject);
  }
  /** @param {string} subject */
  ensure(subject) {
    this.db
      .prepare('INSERT OR IGNORE INTO support_conversations(subject,id) VALUES (?,?)')
      .run(subject, randomUUID());
    return this.conversation(subject);
  }
  /** @param {string} subject @param {boolean} allowed */
  setAgentAccess(subject, allowed) {
    this.ensure(subject);
    this.db
      .prepare('UPDATE support_conversations SET agent_access=? WHERE subject=?')
      .run(allowed ? 1 : 0, subject);
    return { agentAccess: allowed };
  }
  /** @param {string} subject @param {string} id @returns {import('../core/support.js').SupportMessage|null} */
  message(subject, id) {
    const row = this.db
      .prepare('SELECT * FROM support_messages WHERE subject=? AND id=?')
      .get(subject, id);
    if (!row) return null;
    const content = /** @type {{text:string,agent:string|null}} */ (
      JSON.parse(
        Buffer.from(
          this.codec.open(/** @type {Uint8Array} */ (row.value), `${subject}|${id}|support`),
        ).toString(),
      )
    );
    return {
      id,
      sequence: Number(row.sequence),
      role: row.role === 'user' ? 'user' : 'support',
      text: content.text,
      agent: content.agent,
      createdAt: String(row.created),
      delivery:
        row.delivery === 'delivered'
          ? 'delivered'
          : row.delivery === 'cancelled'
            ? 'cancelled'
            : 'queued',
    };
  }
  /** @param {string} subject @param {{id:string,text:string,role:'user'|'support',agent:string|null,createdAt?:string}} input */
  append(subject, input) {
    return transaction(this.db, () => {
      const previous = this.message(subject, input.id);
      if (previous) {
        if (
          previous.text !== input.text ||
          previous.role !== input.role ||
          previous.agent !== input.agent
        )
          throw new PairingError(409, 'This message ID already belongs to a different message.');
        return previous;
      }
      if (input.role === 'user') {
        const recent = this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM support_messages WHERE subject=? AND role='user' AND created>?",
          )
          .get(subject, new Date(Date.now() - 3600000).toISOString());
        if (Number(recent?.count) >= 30)
          throw new PairingError(429, 'Please wait before sending more support messages.');
      }
      this.ensure(subject);
      this.db
        .prepare(
          'INSERT INTO support_messages(subject,id,role,created,delivery,value) VALUES (?,?,?,?,?,?)',
        )
        .run(
          subject,
          input.id,
          input.role,
          input.createdAt ?? new Date().toISOString(),
          input.role === 'user' ? 'queued' : 'delivered',
          this.codec.seal(
            Buffer.from(JSON.stringify({ text: input.text, agent: input.agent })),
            `${subject}|${input.id}|support`,
          ),
        );
      return this.message(subject, input.id);
    });
  }
  /** @param {string} subject @param {number} [before] */
  page(subject, before = Number.MAX_SAFE_INTEGER) {
    const rows = this.db
      .prepare(
        'SELECT id FROM support_messages WHERE subject=? AND sequence<? ORDER BY sequence DESC LIMIT 51',
      )
      .all(subject, before);
    const messages = sorted(
      rows
        .slice(0, 50)
        .map((row) => this.message(subject, String(row.id)))
        .filter((message) => message !== null),
      (a, b) => a.sequence - b.sequence,
    );
    return { messages, hasMore: rows.length > 50, before: messages[0]?.sequence ?? null };
  }
  /** @param {string} subject */
  pending(subject) {
    return this.db
      .prepare(
        "SELECT id FROM support_messages WHERE subject=? AND delivery='queued' ORDER BY sequence LIMIT 30",
      )
      .all(subject)
      .map((row) => this.message(subject, String(row.id)))
      .filter((message) => message !== null);
  }
  /** @param {string} subject @param {string} id */
  cancel(subject, id) {
    this.db
      .prepare(
        "UPDATE support_messages SET delivery='cancelled' WHERE subject=? AND id=? AND delivery='queued'",
      )
      .run(subject, id);
  }
  /** @param {string} subject @param {string} id */
  delivered(subject, id) {
    this.db
      .prepare("UPDATE support_messages SET delivery='delivered' WHERE subject=? AND id=?")
      .run(subject, id);
  }
  /** @param {string} subject @param {string} thread */
  thread(subject, thread) {
    this.db
      .prepare('UPDATE support_conversations SET thread=? WHERE subject=?')
      .run(thread, subject);
  }
  /** @param {string} subject @param {string} cursor */
  cursor(subject, cursor) {
    this.db
      .prepare('UPDATE support_conversations SET cursor=? WHERE subject=?')
      .run(cursor, subject);
  }
  /** @param {string} subject */
  deleteAccount(subject) {
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM support_messages WHERE subject=?').run(subject);
      this.db.prepare('DELETE FROM support_conversations WHERE subject=?').run(subject);
    });
  }
}
