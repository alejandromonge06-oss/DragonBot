const {
    EmbedBuilder,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");

const DEFAULT_COLOR = "#A52BE2";
const DEFAULT_TITLE = "🐉 ¡Bienvenido a {server}!";
const DEFAULT_MESSAGE =
    "Hola {user}, ¡nos alegra tenerte aquí! 🔥\n\n" +
    "Lee las reglas y disfruta tu estadía en la comunidad 🐉";
const DEFAULT_FOOTER = "DRAGONS | Comunidad oficial";

const COLOR_REGEX = /^#([0-9a-fA-F]{6})$/;

function getWelcomeConfig(config, guildId, saveConfig) {
    if (!config[guildId]) config[guildId] = {};
    const guild = config[guildId];

    if (!guild.welcome) {
        guild.welcome = guild.welcomeChannel
            ? { enabled: true, channel: guild.welcomeChannel }
            : { enabled: false };
        if (saveConfig) saveConfig();
    }

    const w = guild.welcome;

    return {
        enabled: w.enabled !== false,
        channel: w.channel || guild.welcomeChannel || null,
        message: w.message || DEFAULT_MESSAGE,
        title: w.title || DEFAULT_TITLE,
        image: w.image || null,
        color: COLOR_REGEX.test(w.color || "") ? w.color : DEFAULT_COLOR,
        footer: w.footer || DEFAULT_FOOTER,
        footerIcon: w.footerIcon || null,
        ping: w.ping !== false
    };
}

function replacePlaceholders(text, member, client) {
    const guild = member.guild;
    const date = new Date().toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });

    return text
        .replace(/\{user\}/g, `${member}`)
        .replace(/\{username\}/g, member.user.username)
        .replace(/\{server\}/g, guild.name)
        .replace(/\{members\}/g, guild.memberCount)
        .replace(/\{miembros\}/g, guild.memberCount)
        .replace(/\{date\}/g, date)
        .replace(/\{id\}/g, member.id)
        .replace(/\{bot\}/g, client.user.username);
}

function buildWelcomeEmbed(member, w, client) {
    const guild = member.guild;

    const embed = new EmbedBuilder()
        .setColor(w.color)
        .setAuthor({
            name: `${client.user.username} | ${guild.name}`,
            iconURL: client.user.displayAvatarURL({ size: 256 })
        })
        .setTitle(replacePlaceholders(w.title, member, client))
        .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
        .setDescription(replacePlaceholders(w.message, member, client))
        .addFields(
            {
                name: "👥 Miembros",
                value: `**${guild.memberCount}**`,
                inline: true
            },
            {
                name: "📅 Fecha de entrada",
                value: new Date().toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                }),
                inline: true
            }
        );

    if (w.image) {
        embed.setImage(w.image);
    }

    const footerText = replacePlaceholders(w.footer, member, client);
    if (w.footerIcon) {
        embed.setFooter({ text: footerText, iconURL: w.footerIcon });
    } else {
        embed.setFooter({
            text: footerText,
            iconURL: client.user.displayAvatarURL({ size: 256 })
        });
    }

    embed.setTimestamp();

    return embed;
}

async function sendWelcome(client, config, saveConfig, guild, member) {
    try {
        const w = getWelcomeConfig(config, guild.id, saveConfig);

        if (!w.enabled || !w.channel) return;

        const channel = guild.channels.cache.get(w.channel);
        if (!channel) {
            console.error("❌ No encontré el canal de bienvenida.");
            return;
        }

        const embed = buildWelcomeEmbed(member, w, client);

        await channel.send({
            content: w.ping ? `${member}` : undefined,
            embeds: [embed]
        });
    } catch (error) {
        console.error("Error al enviar la bienvenida:", error);
    }
}

function saveWelcome(interaction, config, saveConfig, changes) {
    if (!config[interaction.guild.id]) config[interaction.guild.id] = {};

    const guild = config[interaction.guild.id];

    if (!guild.welcome) {
        guild.welcome = guild.welcomeChannel
            ? { enabled: true, channel: guild.welcomeChannel }
            : {};
    }

    Object.assign(guild.welcome, changes);
    saveConfig();
}

function formatConfigReply(interaction, w) {
    const canal = w.channel
        ? `<#${w.channel}>`
        : "No configurado";

    return [
        "## ⚙️ Configuración de bienvenida",
        `**Estado:** ${w.enabled ? "🟢 Activado" : "🔴 Desactivado"}`,
        `**Canal:** ${canal}`,
        `**Color:** ${w.color}`,
        `**Imagen:** ${w.image ? w.image : "Sin imagen"}`,
        `**Footer:** ${w.footer}`,
        "",
        `**Mensaje:**`,
        w.message
    ].join("\n");
}

async function handleWelcomeCommand(interaction, config, saveConfig) {
    if (!interaction.isCommand() || interaction.commandName !== "welcome") return false;

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({
            content: "❌ Solo los administradores pueden configurar el sistema de bienvenida.",
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case "setup": {
            const canal = interaction.options.getChannel("canal");
            const imagen = interaction.options.getString("imagen");
            const color = interaction.options.getString("color");
            const mensaje = interaction.options.getString("mensaje");
            const footer = interaction.options.getString("footer");

            const changes = { enabled: true, channel: canal.id };

            if (imagen && imagen.toLowerCase() !== "none") changes.image = imagen;
            if (color && COLOR_REGEX.test(color)) changes.color = color;
            if (mensaje) changes.message = mensaje;
            if (footer) changes.footer = footer;

            saveWelcome(interaction, config, saveConfig, changes);

            await interaction.reply({
                content: [
                    "✅ **Sistema de bienvenida configurado.**",
                    `📌 Canal: ${canal}`,
                    `🖼️ Imagen: ${changes.image ? "configurada" : "sin cambio / ninguna"}`,
                    `🎨 Color: ${changes.color || "por defecto"}`,
                    `📝 Mensaje: ${mensaje ? "configurado" : "por defecto"}`,
                    `📌 Footer: ${footer ? "configurado" : "por defecto"}`
                ].join("\n"),
                flags: MessageFlags.Ephemeral
            });
            break;
        }

        case "canal": {
            const canal = interaction.options.getChannel("canal");
            saveWelcome(interaction, config, saveConfig, { channel: canal.id });
            await interaction.reply({
                content: `✅ Canal de bienvenida configurado: ${canal}`,
                flags: MessageFlags.Ephemeral
            });
            break;
        }

        case "mensaje": {
            const mensaje = interaction.options.getString("mensaje");
            saveWelcome(interaction, config, saveConfig, { message: mensaje });
            await interaction.reply({
                content: [
                    "✅ **Mensaje de bienvenida actualizado.**",
                    "",
                    `📝 ${mensaje}`,
                    "",
                    "**Variables disponibles:** `{user}` (mención), `{username}`, `{server}`, `{members}`, `{date}`, `{id}`, `{bot}`"
                ].join("\n"),
                flags: MessageFlags.Ephemeral
            });
            break;
        }

        case "imagen": {
            const url = interaction.options.getString("imagen");
            const changes = url.toLowerCase() === "none"
                ? { image: null }
                : { image: url };
            saveWelcome(interaction, config, saveConfig, changes);
            await interaction.reply({
                content: changes.image
                    ? `✅ Banner de bienvenida configurado.\n🖼️ ${changes.image}`
                    : "✅ Banner de bienvenida eliminado.",
                flags: MessageFlags.Ephemeral
            });
            break;
        }

        case "color": {
            const color = interaction.options.getString("color");
            if (!COLOR_REGEX.test(color)) {
                await interaction.reply({
                    content: "❌ Formato de color inválido. Usa formato hexadecimal, ej: `#A52BE2`",
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }
            saveWelcome(interaction, config, saveConfig, { color });
            await interaction.reply({
                content: `🎨 Color del embed configurado: **${color}**`,
                flags: MessageFlags.Ephemeral
            });
            break;
        }

        case "footer": {
            const footer = interaction.options.getString("texto");
            saveWelcome(interaction, config, saveConfig, { footer });
            await interaction.reply({
                content: `📌 Footer configurado: **${footer}**`,
                flags: MessageFlags.Ephemeral
            });
            break;
        }

        case "activar": {
            saveWelcome(interaction, config, saveConfig, { enabled: true });
            await interaction.reply({
                content: "🟢 **Bienvenidas activadas.**",
                flags: MessageFlags.Ephemeral
            });
            break;
        }

        case "desactivar": {
            saveWelcome(interaction, config, saveConfig, { enabled: false });
            await interaction.reply({
                content: "🔴 **Bienvenidas desactivadas.**",
                flags: MessageFlags.Ephemeral
            });
            break;
        }

        case "probar": {
            const w = getWelcomeConfig(config, interaction.guild.id, saveConfig);
            const embed = buildWelcomeEmbed(interaction.member, w, interaction.client);
            await interaction.reply({
                content: `📤 Vista previa del mensaje de bienvenida (${w.enabled ? "activado" : "desactivado"}):`,
                embeds: [embed]
            });
            break;
        }

        case "config": {
            const w = getWelcomeConfig(config, interaction.guild.id, saveConfig);
            await interaction.reply({
                content: formatConfigReply(interaction, w),
                flags: MessageFlags.Ephemeral
            });
            break;
        }

        default:
            await interaction.reply({
                content: "❌ Subcomando no reconocido.",
                flags: MessageFlags.Ephemeral
            });
            break;
    }

    return true;
}

module.exports = {
    getWelcomeConfig,
    sendWelcome,
    handleWelcomeCommand
};
