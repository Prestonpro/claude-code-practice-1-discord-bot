const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../database');

const MAX_QUOTES_PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gurt')
    .setDescription('Word stats for the server — or quote a specific user')
    .addStringOption(opt =>
      opt.setName('word')
        .setDescription('The word to look up')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('user')
        .setDescription('Username to quote (omit to see server-wide stats)')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('page')
        .setDescription('Page number for quotes (default: 1)')
        .setMinValue(1)
    ),

  async execute(interaction) {
    const word    = interaction.options.getString('word').toLowerCase().trim();
    const userArg = interaction.options.getString('user');
    const page    = interaction.options.getInteger('page') ?? 1;

    if (word.includes(' ')) {
      return interaction.reply({
        content: 'Please provide a single word (no spaces).',
        flags: 64,
      });
    }

    await interaction.deferReply();

    if (!userArg) {
      return showStats(interaction, word);
    }

    return showQuotes(interaction, word, userArg.trim(), page);
  },

  handlePagination,
};

async function showStats(interaction, word) {
  const stats = await db.getWordStats(interaction.guildId, word);

  if (stats.length === 0) {
    return interaction.editReply(`No one has said **${word}** yet (or the bot hasn't seen it).`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Word stats: "${word}"`)
    .setColor(0x5865f2)
    .setDescription(
      stats
        .map((row, i) =>
          `**${i + 1}.** ${row.username} — **${row.count}** time${row.count !== 1 ? 's' : ''}`
        )
        .join('\n')
    )
    .setFooter({ text: `Tip: /gurt ${word} <username> to see their quotes` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function showQuotes(interaction, word, userArg, initialPage) {
  const found = await db.findUserByName(interaction.guildId, userArg);

  if (!found) {
    return interaction.editReply(
      `Couldn't find **${userArg}** in my records. They may not have spoken since the bot joined.`
    );
  }

  const quotes = await db.getUserQuotes(interaction.guildId, found.userId, word);

  if (quotes.length === 0) {
    return interaction.editReply(
      `**${found.username}** has never said **${word}** (or the bot hasn't seen it).`
    );
  }

  const totalPages  = Math.ceil(quotes.length / MAX_QUOTES_PER_PAGE);
  const currentPage = Math.min(initialPage, totalPages);

  console.log(`[gurt] "${word}" by ${found.username} (${found.userId}): ${quotes.length} quotes, ${totalPages} pages, buttons=${totalPages > 1}`);

  let components = [];
  if (totalPages > 1) {
    try {
      components = [buildPaginationRow(interaction.guildId, found.userId, word, currentPage, totalPages)];
    } catch (err) {
      console.error('[gurt] buildPaginationRow failed:', err.message);
    }
  }

  return interaction.editReply({
    embeds: [buildQuotesEmbed(found.username, word, quotes, currentPage)],
    components,
  });
}

// Called from index.js when a button with customId starting with "gurt|" is clicked.
async function handlePagination(btnInteraction) {
  console.log(`[gurt] button: ${btnInteraction.customId}`);
  // customId format: gurt|<prev|next>|<guildId>|<userId>|<page>|<word>
  const [, action, guildId, userId, pageStr, ...wordParts] = btnInteraction.customId.split('|');
  const page = parseInt(pageStr, 10);
  const word = wordParts.join('|');

  const originalUserId = btnInteraction.message.interaction?.user?.id;
  if (originalUserId && btnInteraction.user.id !== originalUserId) {
    return btnInteraction.reply({
      content: 'Only the person who ran this command can flip pages.',
      ephemeral: true,
    });
  }

  const newPage = action === 'next' ? page + 1 : page - 1;

  try {
    const [quotes, username] = await Promise.all([
      db.getUserQuotes(guildId, userId, word),
      db.findUserById(guildId, userId),
    ]);

    const totalPages = Math.ceil(quotes.length / MAX_QUOTES_PER_PAGE);
    const safePage   = Math.max(1, Math.min(newPage, totalPages));

    await btnInteraction.update({
      embeds: [buildQuotesEmbed(username ?? 'User', word, quotes, safePage)],
      components: [buildPaginationRow(guildId, userId, word, safePage, totalPages)],
    });
  } catch (err) {
    console.error('[gurt] pagination error:', err.message);
  }
}

function buildQuotesEmbed(username, word, quotes, page) {
  const totalPages = Math.ceil(quotes.length / MAX_QUOTES_PER_PAGE);
  const slice = quotes.slice((page - 1) * MAX_QUOTES_PER_PAGE, page * MAX_QUOTES_PER_PAGE);
  const lines = slice.map((q, i) => {
    const date = new Date(Number(q.timestamp)).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const globalIndex = (page - 1) * MAX_QUOTES_PER_PAGE + i + 1;
    return `**${globalIndex}.** *${date}*\n> ${highlightWord(q.content, word)}`;
  });

  return new EmbedBuilder()
    .setTitle(`Every time ${username} said "${word}"`)
    .setColor(0xeb459e)
    .setDescription(lines.join('\n\n'))
    .setFooter({
      text: `${quotes.length} total quote${quotes.length !== 1 ? 's' : ''} · Page ${page}/${totalPages}`,
    })
    .setTimestamp();
}

// customId encodes all state so no server-side session is needed.
// format: gurt|<prev|next>|<guildId>|<userId>|<page>|<word>
function buildPaginationRow(guildId, userId, word, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gurt|prev|${guildId}|${userId}|${page}|${word}`)
      .setLabel('← Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`gurt|next|${guildId}|${userId}|${page}|${word}`)
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );
}

function highlightWord(content, word) {
  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
  return content.replace(regex, match => `**${match}**`);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
