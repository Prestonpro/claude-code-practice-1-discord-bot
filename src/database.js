const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'wordstats.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
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

  // Migration for databases created before message_id was added
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN message_id TEXT`);
  } catch (_) { /* column already exists */ }
}

/**
 * Persist a message. INSERT OR IGNORE means duplicate message_ids are silently skipped,
 * so backfill and the live listener can both call this safely.
 */
function saveMessage({ messageId, guildId, channelId, userId, username, content, timestamp }) {
  getDb().prepare(`
    INSERT OR IGNORE INTO messages (message_id, guild_id, channel_id, user_id, username, content, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(messageId ?? null, guildId, channelId, userId, username, content.toLowerCase(), timestamp);
}

/**
 * Return how many times each user said a word in a guild.
 * { userId, username, count }[]  sorted by count desc
 */
function getWordStats(guildId, word) {
  const pattern      = `% ${word} %`;
  const patternStart = `${word} %`;
  const patternEnd   = `% ${word}`;
  const exact        = word;

  return getDb().prepare(`
    SELECT user_id AS userId, username, COUNT(*) AS count
    FROM messages
    WHERE guild_id = ?
      AND (
        content LIKE ?
        OR content LIKE ?
        OR content LIKE ?
        OR content = ?
      )
    GROUP BY user_id
    ORDER BY count DESC
  `).all(guildId, pattern, patternStart, patternEnd, exact);
}

/**
 * Return every message a specific user sent that contains the word.
 * { content, timestamp, channelId }[]  sorted oldest first
 */
function getUserQuotes(guildId, userId, word) {
  const pattern      = `% ${word} %`;
  const patternStart = `${word} %`;
  const patternEnd   = `% ${word}`;
  const exact        = word;

  return getDb().prepare(`
    SELECT content, timestamp, channel_id AS channelId
    FROM messages
    WHERE guild_id = ?
      AND user_id = ?
      AND (
        content LIKE ?
        OR content LIKE ?
        OR content LIKE ?
        OR content = ?
      )
    ORDER BY timestamp ASC
  `).all(guildId, userId, pattern, patternStart, patternEnd, exact);
}

/**
 * Look up a user_id by username (case-insensitive) within a guild.
 * Returns null if not found.
 */
function findUserByName(guildId, username) {
  return getDb().prepare(`
    SELECT user_id AS userId, username
    FROM messages
    WHERE guild_id = ?
      AND LOWER(username) LIKE LOWER(?)
    LIMIT 1
  `).get(guildId, username) || null;
}

module.exports = { saveMessage, getWordStats, getUserQuotes, findUserByName };
