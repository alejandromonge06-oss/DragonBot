const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionsBitField
} = require("discord.js");
const { getWarnings } = require("./moderation");

const DRAGON_COLOR = "#A52BE2";
const FOOTER = "🐉 DRAGONS | User Info";

const STATUS_LABELS = {
    online: "🟢 En línea",
    idle: "🟡 Inactivo",
    dnd: "🔴 No molestar",
    offline: "⚫ Desconectado",
    unknown: "⚪ Desconocido"
};

function formatDate(date) {
    if (!date) return "Desconocida";
    return new Date(date).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getStatus(member) {
    const status = member?.presence?.status;
    return STATUS_LABELS[status] || STATUS_LABELS.unknown;
}

function sortedRoles(guild, member) {
    if (!member) return [];
    return [...member.roles.cache.values()]
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);
}

function listRoles(guild, member) {
    const roles = sortedRoles(guild, member);
    if (!member) return "No está en el servidor";
    if (!roles.length) return "Sin roles";
    const shown = roles.slice(0, 15).map(r => r).join(" ");
    const rest = roles.length - 15;
    return `${shown}${rest > 0 ? `\n...y ${rest} más` : ""}`;
}

function sanctionsLine(member, warnings, quarantine) {
    const parts = [];
    parts.push(`**${warnings.length}** advertencia(s)`);
    if (member?.communicationDisabledUntil && member.communicationDisabledUntil > Date.now()) {
        parts.push("⏸️ Mute temporal");
    }
    if (quarantine) parts.push("🔒 En cuarentena");
    return parts.join(" · ");
}

function hasModPerm(interaction) {
    const perms = interaction.member?.permissions;
    return perms?.has(PermissionsBitField.Flags.ModerateMembers) ||
        perms?.has(PermissionsBitField.Flags.Administrator);
}

function mainRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ui_avatar_${userId}`).setLabel("Ver avatar").setEmoji("🖼️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ui_copyid_${userId}`).setLabel("Copiar ID").setEmoji("📋").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ui_roles_${userId}`).setLabel("Ver roles").setEmoji("🏷️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ui_history_${userId}`).setLabel("Historial").setEmoji("⚠️").setStyle(ButtonStyle.Secondary)
    );
}

function backRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ui_main_${userId}`).setLabel("Volver").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
    );
}

function avatarRow(userId, url) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Abrir en grande").setURL(url),
        new ButtonBuilder().setCustomId(`ui_main_${userId}`).setLabel("Volver").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
    );
}

function avatarEmbed(user, member) {
    const url = user.displayAvatarURL({ size: 1024, extension: "png" });
    return new EmbedBuilder()
        .setColor(member?.roles?.color?.hexColor || DRAGON_COLOR)
        .setAuthor({ name: user.tag, iconURL: url })
        .setTitle(`🖼️ Avatar de ${user.username}`)
        .setImage(url)
        .setFooter({ text: FOOTER })
        .setTimestamp();
}

function rolesEmbed(guild, member, user) {
    const embed = new EmbedBuilder()
        .setColor(DRAGON_COLOR)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
        .setTitle(`🏷️ Roles de ${user.username}`)
        .setFooter({ text: FOOTER })
        .setTimestamp();

    if (!member) {
        embed.setDescription("No está en el servidor.");
        return embed;
    }

    const roles = sortedRoles(guild, member);
    if (!roles.length) {
        embed.setDescription("Sin roles.");
        return embed;
    }

    embed.setDescription(roles.map(r => `${r}`).join("\n").slice(0, 4096));
    return embed;
}

function historyEmbed(user, warnings) {
    const embed = new EmbedBuilder()
        .setColor(DRAGON_COLOR)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
        .setTitle(`⚠️ Historial de moderación — ${user.username}`)
        .setFooter({ text: FOOTER })
        .setTimestamp();

    if (!warnings.length) {
        embed.setDescription("✅ Sin sanciones registradas.");
        return embed;
    }

    const lines = warnings.map((w, i) => {
        const fecha = new Date(w.date).toLocaleString("es-ES");
        return `**#${i + 1}** · ${fecha}\n📝 ${w.reason}\n🛡️ ${w.mod}`;
    });

    embed.setDescription(lines.join("\n\n").slice(0, 4096));
    return embed;
}

function buildMainEmbed(interaction, config, user, member) {
    const guild = interaction.guild;
    const warnings = getWarnings(config, guild.id, user.id);
    const quarantine = config[guild.id]?.security?.quarantine?.[user.id];
    const color = member?.roles?.color;

    return new EmbedBuilder()
        .setColor(color?.hexColor || DRAGON_COLOR)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
        .setTitle("🐉 Información del usuario")
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setDescription(
            `${user} — ${user.bot ? "🤖 Bot" : "👤 Usuario"}`
        )
        .addFields(
            { name: "👤 Nombre", value: user.username, inline: true },
            { name: "🆔 ID de Discord", value: `\`${user.id}\``, inline: true },
            { name: "🤖 Tipo", value: user.bot ? "🤖 Bot" : "👤 Usuario", inline: true },
            { name: "📅 Cuenta creada", value: formatDate(user.createdAt), inline: true },
            { name: "📥 Entrada al servidor", value: member ? formatDate(member.joinedAt) : "No está en el servidor", inline: true },
            { name: "🟢 Estado", value: getStatus(member), inline: true },
            { name: "🎨 Color/rol principal", value: color ? `\`${color.hexColor}\` — ${color}` : "Sin rol de color", inline: true },
            { name: "⚠️ Sanciones", value: sanctionsLine(member, warnings, quarantine), inline: true },
            { name: "🏷️ Roles", value: listRoles(guild, member).slice(0, 1024), inline: false }
        )
        .setFooter({ text: `${FOOTER} · ${interaction.user.tag}` })
        .setTimestamp();
}

async function handleCommand(interaction, config) {
    const target = interaction.options.getUser("usuario") || interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const embed = buildMainEmbed(interaction, config, target, member);
    await interaction.reply({ embeds: [embed], components: [mainRow(target.id)] });
}

async function handleButton(interaction, config) {
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const userId = parts.slice(2).join("_");

    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (!user) {
        await interaction.reply({
            content: "❌ No se pudo obtener el usuario.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    switch (action) {
        case "avatar": {
            const url = user.displayAvatarURL({ size: 1024, extension: "png" });
            await interaction.update({
                embeds: [avatarEmbed(user, member)],
                components: [avatarRow(userId, url)]
            });
            return;
        }
        case "copyid": {
            await interaction.reply({
                content: `📋 ID de **${user.tag}**: \`${user.id}\``,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        case "roles": {
            await interaction.update({
                embeds: [rolesEmbed(interaction.guild, member, user)],
                components: [backRow(userId)]
            });
            return;
        }
        case "history": {
            if (!hasModPerm(interaction)) {
                await interaction.reply({
                    content: "❌ Solo el personal de moderación puede ver el historial.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            const warnings = getWarnings(config, interaction.guild.id, userId);
            await interaction.update({
                embeds: [historyEmbed(user, warnings)],
                components: [backRow(userId)]
            });
            return;
        }
        case "main": {
            const embed = buildMainEmbed(interaction, config, user, member);
            await interaction.update({ embeds: [embed], components: [mainRow(userId)] });
            return;
        }
        default:
            return;
    }
}

async function handleUserInfoInteraction(interaction, config, saveConfig) {
    if (interaction.isCommand() && interaction.commandName === "userinfo") {
        await handleCommand(interaction, config);
        return true;
    }

    if (interaction.isButton() && interaction.customId?.startsWith("ui_")) {
        await handleButton(interaction, config);
        return true;
    }

    return false;
}

module.exports = {
    handleUserInfoInteraction
};
