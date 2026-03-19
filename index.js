// -----------------------------------------------------
// .gg/ ``~ lotion — Single File Bot (All Embeds Version)
// -----------------------------------------------------

import 'dotenv/config';
import fs from 'fs-extra';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';

// -----------------------------------------------------
// Client Setup
// -----------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const PREFIX = process.env.PREFIX || '.';
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.TOKEN;

const EMBED_COLOR = '#B9BBBE';
const BOT_NAME = '.gg/ ``~ lotion';

const GIVEAWAY_FILE = './giveaways.json';
if (!fs.existsSync(GIVEAWAY_FILE)) fs.writeFileSync(GIVEAWAY_FILE, '[]');

// -----------------------------------------------------
// Utility Functions
// -----------------------------------------------------

function embed(desc) {
  return new EmbedBuilder()
    .setDescription(desc)
    .setColor(EMBED_COLOR)
    .setFooter({
      text: BOT_NAME,
      iconURL: client.user?.displayAvatarURL()
    });
}

function hoursToMs(hours) {
  const h = Number(hours);
  if (isNaN(h) || h <= 0) return null;
  return h * 60 * 60 * 1000;
}

async function loadGiveaways() {
  return JSON.parse(await fs.readFile(GIVEAWAY_FILE, 'utf8'));
}

async function saveGiveaways(data) {
  await fs.writeFile(GIVEAWAY_FILE, JSON.stringify(data, null, 2));
}

async function endGiveaway(messageId, reroll = false) {
  const data = await loadGiveaways();
  const gw = data.find(g => g.messageId === messageId);
  if (!gw) return null;

  const guild = await client.guilds.fetch(gw.guildId).catch(() => null);
  if (!guild) return null;

  const channel = await guild.channels.fetch(gw.channelId).catch(() => null);
  if (!channel) return null;

  const message = await channel.messages.fetch(gw.messageId).catch(() => null);
  if (!message) return null;

  const reaction = message.reactions.cache.get('🎉');
  if (!reaction) return { message, winner: null };

  const users = await reaction.users.fetch();
  const filtered = users.filter(u => !u.bot);

  if (!filtered.size) {
    await channel.send({ embeds: [embed('No valid entries.')] });
    return { message, winner: null };
  }

  const winner = filtered.random();

  const resultEmbed = new EmbedBuilder()
    .setTitle(reroll ? '🎉 Giveaway Rerolled!' : '🎉 Giveaway Ended!')
    .setDescription(`Prize: **${gw.prize}**\nWinner: ${winner}`)
    .setColor(EMBED_COLOR)
    .setFooter({
      text: BOT_NAME,
      iconURL: client.user.displayAvatarURL()
    });

  await channel.send({ content: `${winner}`, embeds: [resultEmbed] });

  if (!reroll) {
    const remaining = data.filter(g => g.messageId !== messageId);
    await saveGiveaways(remaining);
  }

  return { message, winner };
}

async function checkExpiredGiveaways() {
  const data = await loadGiveaways();
  const now = Date.now();
  const expired = data.filter(g => g.endAt <= now);

  for (const gw of expired) {
    await endGiveaway(gw.messageId, false);
  }
}

// -----------------------------------------------------
// Slash Command Registration
// -----------------------------------------------------

const slashCommands = [
  new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Show all bot commands')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerSlash() {
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
    body: slashCommands
  });
}

// -----------------------------------------------------
// Ready Event
// -----------------------------------------------------

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: 'Watching .gg/lotion', type: 3 }],
    status: 'online'
  });

  await registerSlash();

  setInterval(() => checkExpiredGiveaways(), 30_000);

  console.log(`${BOT_NAME} is online.`);
});

// -----------------------------------------------------
// Slash Command Handler
// -----------------------------------------------------

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'commands') {
    const embedObj = new EmbedBuilder()
      .setTitle('Command List')
      .setColor(EMBED_COLOR)
      .setFooter({
        text: BOT_NAME,
        iconURL: client.user.displayAvatarURL()
      })
      .addFields(
        {
          name: '🛡️ Moderation',
          value: [
            `\`${PREFIX}ban @user [reason]\``,
            `\`${PREFIX}kick @user [reason]\``,
            `\`${PREFIX}mute @user [hours]\``,
            `\`${PREFIX}unmute @user\``,
            `\`${PREFIX}purge <amount>\``
          ].join('\n')
        },
        {
          name: '🎭 Roles',
          value: [
            `\`${PREFIX}addrole @user <role>\``,
            `\`${PREFIX}removerole @user <role>\``,
            `\`${PREFIX}createrole <name>\``,
            `\`${PREFIX}deleterole <name>\``
          ].join('\n')
        },
        {
          name: '🎉 Giveaways',
          value: [
            `\`${PREFIX}gwstart <hours> <prize>\``,
            `\`${PREFIX}gwend <messageID>\``,
            `\`${PREFIX}gwroll <messageID>\``
          ].join('\n')
        },
        {
          name: '🏛️ Server',
          value: [
            `\`${PREFIX}setdesc <description>\``,
            `\`${PREFIX}settags <tag1, tag2, tag3>\``

          ].join('\n')
        }
      );

    return interaction.reply({ embeds: [embedObj], ephemeral: true });
  }
});

// -----------------------------------------------------
// Prefix Command Handler
// -----------------------------------------------------

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  const staff = message.member.roles.cache.has(STAFF_ROLE_ID);

  // ------------------------------
  // Moderation
  // ------------------------------

  if (cmd === 'ban') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.channel.send({ embeds: [embed('Mention someone.')] });
    const reason = args.join(' ') || 'No reason';
    await member.ban({ reason }).catch(() => null);
    return message.channel.send({ embeds: [embed(`Banned **${member.user.tag}**`)] });
  }

  if (cmd === 'kick') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.channel.send({ embeds: [embed('Mention someone.')] });
    const reason = args.join(' ') || 'No reason';
    await member.kick(reason).catch(() => null);
    return message.channel.send({ embeds: [embed(`Kicked **${member.user.tag}**`)] });
  }

  if (cmd === 'mute') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const member = message.mentions.members.first();
    const hours = args[1];
    const ms = hoursToMs(hours);
    if (!member || !ms) return message.channel.send({ embeds: [embed('Usage: .mute @user <hours>')] });
    await member.timeout(ms).catch(() => null);
    return message.channel.send({ embeds: [embed(`Muted **${member.user.tag}** for ${hours}h`)] });
  }

  if (cmd === 'unmute') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.channel.send({ embeds: [embed('Mention someone.')] });
    await member.timeout(null).catch(() => null);
    return message.channel.send({ embeds: [embed(`Unmuted **${member.user.tag}**`)] });
  }

  if (cmd === 'purge') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const amount = Number(args[0]);
    if (!amount || amount < 1 || amount > 100)
      return message.channel.send({ embeds: [embed('Enter 1–100.')] });
    await message.channel.bulkDelete(amount, true);
    return message.channel.send({ embeds: [embed(`Deleted ${amount} messages.`)] });
  }

  // ------------------------------
  // Roles
  // ------------------------------

  if (cmd === 'addrole') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const member = message.mentions.members.first();
    const roleName = args.slice(1).join(' ');
    const role = message.guild.roles.cache.find(r => r.name === roleName);
    if (!member || !role) return message.channel.send({ embeds: [embed('Invalid user/role.')] });
    await member.roles.add(role);
    return message.channel.send({ embeds: [embed(`Added **${role.name}** to **${member.user.tag}**`)] });
  }

  if (cmd === 'removerole') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const member = message.mentions.members.first();
    const roleName = args.slice(1).join(' ');
    const role = message.guild.roles.cache.find(r => r.name === roleName);
    if (!member || !role) return message.channel.send({ embeds: [embed('Invalid user/role.')] });
    await member.roles.remove(role);
    return message.channel.send({ embeds: [embed(`Removed **${role.name}** from **${member.user.tag}**`)] });
  }

  if (cmd === 'createrole') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const name = args.join(' ');
    if (!name) return message.channel.send({ embeds: [embed('Provide a name.')] });
    await message.guild.roles.create({ name });
    return message.channel.send({ embeds: [embed(`Created role **${name}**`)] });
  }

  if (cmd === 'deleterole') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const name = args.join(' ');
    const role = message.guild.roles.cache.find(r => r.name === name);
    if (!role) return message.channel.send({ embeds: [embed('Role not found.')] });
    await role.delete();
    return message.channel.send({ embeds: [embed(`Deleted role **${name}**`)] });
  }

  // ------------------------------
  // Server Editing
  // ------------------------------

  if (cmd === 'setdesc') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const desc = args.join(' ');
    if (!desc) return message.channel.send({ embeds: [embed('Provide description.')] });
    await message.guild.setDescription(desc).catch(() => null);
    return message.channel.send({ embeds: [embed('Server description updated.')] });
  }

  if (cmd === 'settags') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const tags = args.join(' ').split(',').map(t => t.trim()).filter(Boolean);
    if (!tags.length || tags.length > 5)
      return message.channel.send({ embeds: [embed('1–5 tags only.')] });
    await message.guild.setAvailableTags(tags).catch(() => null);
    return message.channel.send({ embeds: [embed('Server tags updated.')] });
  }

  // ------------------------------
  // Giveaways
  // ------------------------------

  if (cmd === 'gwstart') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const hours = args.shift();
    const ms = hoursToMs(hours);
    if (!ms) return message.channel.send({ embeds: [embed('Invalid hours.')] });
    const prize = args.join(' ');
    if (!prize) return message.channel.send({ embeds: [embed('Provide prize.')] });

    const endAt = Date.now() + ms;

    const gwEmbed = new EmbedBuilder()
      .setTitle('🎉 Giveaway')
      .setDescription(
        `Prize: **${prize}**\nReact with 🎉 to enter!\nEnds <t:${Math.floor(
          endAt / 1000
        )}:R>`
      )
      .setColor(EMBED_COLOR)
      .setFooter({
        text: BOT_NAME,
        iconURL: client.user.displayAvatarURL()
      })
      .setTimestamp(endAt);

    const msg = await message.channel.send({ embeds: [gwEmbed] });
    await msg.react('🎉');

    const data = await loadGiveaways();
    data.push({
      guildId: message.guild.id,
      channelId: message.channel.id,
      messageId: msg.id,
      prize,
      hostId: message.author.id,
      endAt
    });
    await saveGiveaways(data);

    return message.channel.send({ embeds: [embed('Giveaway started.')] });
  }

  if (cmd === 'gwend') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const id = args[0];
    if (!id) return message.channel.send({ embeds: [embed('Provide message ID.')] });
    await endGiveaway(id, false);
    return message.channel.send({ embeds: [embed('Giveaway ended.')] });
  }

  if (cmd === 'gwroll') {
    if (!staff) return message.channel.send({ embeds: [embed('No permission.')] });
    const id = args[0];
    if (!id) return message.channel.send({ embeds: [embed('Provide message ID.')] });
    await endGiveaway(id, true);
    return message.channel.send({ embeds: [embed('Giveaway rerolled.')] });
  }
});

// -----------------------------------------------------
// Welcome Message (Event Group B)
// -----------------------------------------------------

client.on('guildMemberAdd', async member => {
  const channel = member.guild.channels.cache.get('1484065588522385489');
  if (!channel) return;

  const welcomeEmbed = new EmbedBuilder()
    .setTitle('!!')
    .setDescription(
      `welcome to .gg/lotion ${member} --\n` +
      `check out our https://discord.com/channels/1483020540070330378/1484066104509857835 and https://discord.com/channels/1483020540070330378/1484066181378998342 \`.\`.\`.`
    )
    .setColor(EMBED_COLOR)
    .setFooter({
      text: BOT_NAME,
      iconURL: client.user.displayAvatarURL()
    });

  channel.send({ embeds: [welcomeEmbed] });
});

// -----------------------------------------------------
// Boost Message (Event Group B)
// -----------------------------------------------------

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const wasBoosting = oldMember.premiumSince;
  const isBoosting = newMember.premiumSince;

  if (!wasBoosting && isBoosting) {
    const channel = newMember.guild.channels.cache.get('1484093828574089267');
    if (!channel) return;

    const boostEmbed = new EmbedBuilder()
      .setTitle('!!')
      .setDescription(
        `.gg/lotion has a new boost!\n\n` +
        `thank you ${newMember} for boosting! <3`
      )
      .setColor(EMBED_COLOR)
      .setFooter({
        text: BOT_NAME,
        iconURL: client.user.displayAvatarURL()
      });

    channel.send({ embeds: [boostEmbed] });
  }
});

// -----------------------------------------------------
// Uptime Server
// -----------------------------------------------------

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(process.env.PORT || 3000, () => {
  console.log('Uptime server running');
});

// -----------------------------------------------------
// Login
// -----------------------------------------------------

client.login(TOKEN);
