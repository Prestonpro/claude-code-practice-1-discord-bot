const { saveMessage } = require('./database');

function attachMessageListener(client) {
  client.on('messageCreate', async message => {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.content.trim()) return;

    await saveMessage({
      messageId: message.id,
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
