const db = require('./database');

/**
 * Attach the passive message listener to the client.
 * Every non-bot message in every guild is stored in the database
 * so /wordstats and /quotes can query it later.
 */
function attachMessageListener(client) {
  client.on('messageCreate', message => {
    // Ignore DMs, bot messages, and empty content
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.content.trim()) return;

    db.saveMessage({
      guildId:   message.guild.id,
      channelId: message.channel.id,
      userId:    message.author.id,
      username:  message.author.username,
      content:   message.content,
      timestamp: message.createdTimestamp,
    });
  });
}

module.exports = { attachMessageListener };
