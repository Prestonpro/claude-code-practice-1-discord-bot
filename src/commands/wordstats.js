const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wordstats')
    .setDescription('See how many times a word was said by each person in the server')
    .addStringOption(opt =>
      opt.setName('word')
        .setDescription('The word to look up')
        .setRequired(true)
    ),

  async execute(interaction) {
    const word = interaction.options.getString('word').toLowerCase().trim();

    if (word.includes(' ')) {
      return interaction.reply({
        content: 'Please provide a single word (no spaces).',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const stats = db.getWordStats(interaction.guildId, word);

    if (stats.length === 0) {
      return interaction.editReply(`No one has said **${word}** yet (or the bot hasn't seen it).`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`Word stats: "${word}"`)
      .setColor(0x5865f2)
      .setDescription(
        stats
          .map((row, i) => `**${i + 1}.** ${row.username} — **${row.count}** time${row.count !== 1 ? 's' : ''}`)
          .join('\n')
      )
      .setFooter({ text: `Tip: use /quotes word:${word} user:<name> to see their exact messages` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
