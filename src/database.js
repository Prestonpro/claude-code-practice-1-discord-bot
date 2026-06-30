const { createClient } = require('@libsql/client');

// Local dev:  set TURSO_URL=file:wordstats.db  (or omit and it defaults below)
// Production: set TURSO_URL=libsql://... and TURSO_AUTH_TOKEN=...
const url       = process.env.TURSO_URL       || 'file:wordstats.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

console.log(`[db] Using: ${url} | persistent=${url.startsWith('libsql://')}`);

const db = createClient({ url, authToken });

async function initSchema() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  TEXT UNIQUE,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      username    TEXT NOT NULL,
      content     TEXT NOT NULL,
      timestamp   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_guild ON messages(guild_id);
    CREATE INDEX IF NOT EXISTS idx_user  ON messages(guild_id, user_id);
  `);
}

/**
 * Strip punctuation and collapse whitespace so word matching is reliable.
 * "pizza!" → "pizza"   "hello, world" → "hello  world"
 */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Persist a message. Duplicate message_ids are silently ignored.
 * Returns 1 if inserted, 0 if duplicate.
 */
async function saveMessage({ messageId, guildId, channelId, userId, username, content, timestamp }) {
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO messages
          (message_id, guild_id, channel_id, user_id, username, content, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [messageId ?? null, guildId, channelId, userId, username, normalize(content), timestamp],
  });
  return result.rowsAffected;
}

/**
 * Return how many times each user said a word in a guild.
 * { userId, username, count }[]  sorted by count desc
 */
async function getWordStats(guildId, word) {
  const w = normalize(word);
  const result = await db.execute({
    sql: `SELECT user_id AS userId, username,
            SUM(
              (LENGTH(' ' || content || ' ') - LENGTH(REPLACE(' ' || content || ' ', ' ' || ? || ' ', '')))
              / LENGTH(' ' || ? || ' ')
            ) AS count
          FROM messages
          WHERE guild_id = ?
            AND (' ' || content || ' ') LIKE ('%' || ' ' || ? || ' ' || '%')
          GROUP BY user_id
          ORDER BY count DESC`,
    args: [w, w, guildId, w],
  });
  return result.rows;
}

/**
 * Return every message a specific user sent that contains the word.
 * { content, timestamp, channelId }[]  sorted oldest first
 */
async function getUserQuotes(guildId, userId, word) {
  const w = normalize(word);
  const result = await db.execute({
    sql: `SELECT content, timestamp, channel_id AS channelId
          FROM messages
          WHERE guild_id = ?
            AND user_id = ?
            AND (' ' || content || ' ') LIKE ('%' || ' ' || ? || ' ' || '%')
          ORDER BY timestamp ASC`,
    args: [guildId, userId, w],
  });
  return result.rows;
}

/**
 * Look up a user_id by username (case-insensitive) within a guild.
 * Returns null if not found.
 */
async function findUserByName(guildId, username) {
  const result = await db.execute({
    sql: `SELECT user_id AS userId, username
          FROM messages
          WHERE guild_id = ?
            AND LOWER(username) LIKE LOWER(?)
          LIMIT 1`,
    args: [guildId, username],
  });
  return result.rows[0] || null;
}

/**
 * Insert many messages at once using batched requests (500 per round-trip).
 * Much faster than saveMessage() in a loop when uploading large history.
 * Returns total number of newly inserted rows.
 */
async function bulkSaveMessages(messages) {
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const chunk = messages.slice(i, i + CHUNK);
    const statements = chunk.map(m => ({
      sql: `INSERT OR IGNORE INTO messages
            (message_id, guild_id, channel_id, user_id, username, content, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [m.messageId ?? null, m.guildId, m.channelId, m.userId, m.username, normalize(m.content), m.timestamp],
    }));
    const results = await db.batch(statements, 'write');
    inserted += results.reduce((sum, r) => sum + r.rowsAffected, 0);
    console.log(`[backfill] Uploaded ${Math.min(i + CHUNK, messages.length)}/${messages.length} messages...`);
  }
  return inserted;
}

async function getMessageCount(guildId) {
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS total FROM messages WHERE guild_id = ?`,
    args: [guildId],
  });
  return Number(result.rows[0].total);
}

module.exports = { initSchema, saveMessage, bulkSaveMessages, getWordStats, getUserQuotes, findUserByName, getMessageCount };
