# Claude Code Practice 1: Discord Word Stats Bot

> This file is updated continuously as the project evolves.
> Each session adds an entry under the relevant date.

---

## Project Overview

A Discord bot that passively listens to every message in a server and lets you query word-usage statistics per user.

**Slash commands:**
| Command | What it does |
|---------|-------------|
| `/gurt <word>` | Shows how many times each server member said the word |
| `/gurt <word> <user> [page:<n>]` | Quotes every message where that user said the word, paginated |

**Tech stack:** Node.js · discord.js v14 · better-sqlite3 · dotenv

---

## Setup Instructions

1. **Create a Discord application** at <https://discord.com/developers/applications>
2. Enable **Message Content Intent** under Bot → Privileged Gateway Intents
3. Copy `.env.example` → `.env` and fill in your `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`
4. `npm install`
5. `npm run deploy` — registers slash commands with your server
6. `npm start` — starts the bot

---

## Change Log

### 2026-06-30 — Initial build

**What was built:**
- `src/database.js` — SQLite-backed message store. Schema: `messages(id, guild_id, channel_id, user_id, username, content, timestamp)`. Word matching uses four LIKE patterns to catch the word at the start, middle, end, and as the whole message.
- `src/messageListener.js` — `messageCreate` listener that stores every non-bot, non-DM message.
- `src/commands/wordstats.js` — `/wordstats` slash command. Returns an embed listing every user who said the word with their count, sorted descending.
- `src/commands/quotes.js` — `/quotes` slash command. Looks up a user by name (fuzzy, case-insensitive), then pages through all their messages containing the word. The matched word is bold-highlighted in each quote.
- `src/deploy-commands.js` — one-shot script to register slash commands via Discord REST API.
- `src/index.js` — entry point: loads commands, attaches interaction handler and message listener, validates env vars on startup.

**Decisions made:**
- Used SQLite (better-sqlite3) for zero-infra persistence — no external database needed to run locally.
- Word matching is done in SQL LIKE rather than full-text search so there are no extra dependencies. Full-text search (FTS5) can be added later if performance becomes an issue.
- Messages are stored lowercased for case-insensitive word matching.
- The bot only starts tracking from when it joins — historical messages are not backfilled (Discord API limitations).

**Known limitations / future work:**
- [ ] Add a `/topwords` command showing the most-used words server-wide or per user
- [ ] Backfill historical messages by reading channel history on startup (requires MANAGE_MESSAGES or reading channel history)
- [ ] Add FTS5 for faster word search on large servers
- [ ] Add per-channel filtering option to `/gurt`
- [ ] Deploy to a VPS / Railway / Fly.io so the bot runs 24/7

---

### 2026-06-30 — Consolidated commands into /gurt

**What changed:**
- Deleted `src/commands/wordstats.js` and `src/commands/quotes.js`
- Created `src/commands/gurt.js` — single `/gurt` command that handles both modes:
  - `/gurt <word>` → server-wide stats embed (same as old `/wordstats`)
  - `/gurt <word> <user>` → user quotes embed (same as old `/quotes`)
  - `/gurt <word> <user> page:<n>` → paginated quotes

**Why:** Cleaner UX — one command name to remember, `user` is optional so it naturally falls back to stats mode.
