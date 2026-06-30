const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { bulkSaveMessages } = require('./database');

/**
 * Collect all Discord history into memory first, then upload to Turso in bulk.
 * This minimises round-trips: many Discord fetches (rate-limited anyway),
 * then one fast batch upload instead of one DB call per message.
 */
async function backfillAllGuilds(client) {
  const allMessages = [];

  for (const [, guild] of client.guilds.cache) {
    await collectGuildMessages(guild, allMessages);
  }

  console.log(`[backfill] Fetched ${allMessages.length} messages from Discord. Uploading to database...`);
  const inserted = await bulkSaveMessages(allMessages);
  console.log(`[backfill] Done. ${inserted} new messages stored.`);
}

async function collectGuildMessages(guild, out) {
  const textChannels = guild.channels.cache.filter(ch => {
    if (ch.type !== ChannelType.GuildText) return false;
    if (!ch.viewable) return false;
    const perms = ch.permissionsFor(guild.members.me);
    return perms && perms.has(PermissionFlagsBits.ReadMessageHistory);
  });

  for (const [, channel] of textChannels) {
    await collectChannelMessages(channel, out);
  }
}

async function collectChannelMessages(channel, out) {
  let lastId = null;
  let fetched = 0;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    let batch;
    try {
      batch = await channel.messages.fetch(options);
    } catch (err) {
      console.warn(`[backfill] Skipping #${channel.name}: ${err.message}`);
      break;
    }

    if (batch.size === 0) break;

    for (const [, msg] of batch) {
      if (msg.author.bot) continue;
      if (!msg.content.trim()) continue;
      out.push({
        messageId: msg.id,
        guildId:   msg.guild.id,
        channelId: msg.channel.id,
        userId:    msg.author.id,
        username:  msg.author.username,
        content:   msg.content,
        timestamp: msg.createdTimestamp,
      });
      fetched++;
    }

    lastId = batch.last().id;
    if (batch.size < 100) break;

    await sleep(1100);
  }

  if (fetched > 0) console.log(`[backfill] #${channel.name}: ${fetched} messages collected`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { backfillAllGuilds };
