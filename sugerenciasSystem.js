const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");

function getGuildConfig(config, guildId) {
    if (!config[guildId]) config[guildId] = {};
    return config[guildId];
}

function getSugerenciasConfig(config, guildId) {
    const gc = getGuildConfig(config, guildId);
    if (!gc.sugerencias) gc.sugerencias = { enabled: false, channel: null, logChannel: null };
    return gc.sugerencias;
}

function isStaff(member, gc) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return true;
    if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
    const roles = gc.panel?.roles || [];
    return roles.some(rid => member.roles.cache.has(rid));
}

function suggestionEmbed(s) {
    const statusColor = {
        pending: "#FFC53D",
        approved: "#57F287",
        rejected: "#ED4245"
    }[s.status] || "#FFC53D";

    const statusText = {
        pending: "⏳ En revisión",
        approved: "✅ Aprobada",
        rejected: "❌ Rechazada"
    }[s.status] || "⏳ En revisión";

    return new EmbedBuilder()
        .setColor(statusColor)
        .setTitle("💡 Sugerencia")
        .setDescription(s.text)
        .addFields(
            { name: "Estado", value: statusText, inline: true },
            { name: "Autor", value: `<@${s.authorId}>`, inline: true }
        )
        .setFooter({ text: `Sugerencia #${s.id}` })
        .setTimestamp(s.createdAt);
}

function buttons(id, status) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sugerir_aprob_${id}`)
            .setLabel("✅ Aprobar")
            .setStyle(ButtonStyle.Success)
            .setDisabled(status !== "pending"),
        new ButtonBuilder()
            .setCustomId(`sugerir_rechaz_${id}`)
            .setLabel("❌ Rechazar")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(status !== "pending")
    );
}

async function submitSuggestion(interaction, config, saveConfig) {
    const guild = interaction.guild;
    const sug = getSugerenciasConfig(config, guild.id);

    if (!sug.enabled) {
        return interaction.reply({
            content: "🔴 El sistema de sugerencias está desactivado. Actívalo en `/panel` → 💡 Sugerencias.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!sug.channel) {
        return interaction.reply({
            content: "❌ No hay canal de sugerencias configurado. Configúralo en `/panel` → 💡 Sugerencias.",
            flags: MessageFlags.Ephemeral
        });
    }

    const channel = guild.channels.cache.get(sug.channel);
    if (!channel) {
        return interaction.reply({
            content: "❌ El canal de sugerencias configurado ya no existe.",
            flags: MessageFlags.Ephemeral
        });
    }

    const texto = interaction.options.getString("sugerencia");
    if (!texto || texto.length < 4) {
        return interaction.reply({
            content: "❌ La sugerencia es demasiado corta.",
            flags: MessageFlags.Ephemeral
        });
    }

    const id = `${Date.now()}`;
    const suggestion = {
        id,
        text: texto,
        authorId: interaction.user.id,
        status: "pending",
        createdAt: Date.now()
    };

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = suggestionEmbed(suggestion);

    await channel.send({
        content: `💡 Nueva sugerencia de <@${interaction.user.id}>`,
        embeds: [embed],
        components: [buttons(id, suggestion.status)]
    });

    const logChannel = sug.logChannel ? guild.channels.cache.get(sug.logChannel) : null;
    if (logChannel) {
        await logChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#FFC53D")
                    .setTitle("💡 Nueva sugerencia")
                    .setDescription(`<@${interaction.user.id}> sugirió:\n\n> ${texto}`)
                    .setTimestamp()
            ]
        }).catch(() => {});
    }

    return interaction.editReply({
        content: `✅ Tu sugerencia se ha publicado en ${channel}.`
    });
}

async function resolveSuggestion(interaction, config, saveConfig) {
    const guild = interaction.guild;
    const gc = getGuildConfig(config, guild.id);

    if (!isStaff(interaction.member, gc)) {
        return interaction.reply({
            content: "❌ Solo el personal puede aprobar o rechazar sugerencias.",
            flags: MessageFlags.Ephemeral
        });
    }

    const approved = interaction.customId.startsWith("sugerir_aprob_");
    const id = interaction.customId.replace(/^sugerir_(aprob|rechaz)_/, "");

    const message = interaction.message;
    const embed = message.embeds[0];
    if (!embed) return;

    const newStatus = approved ? "approved" : "rejected";
    const oldStatus = message.components?.[0]?.components?.[0]?.disabled ? "closed" : "pending";
    if (oldStatus === "closed") {
        return interaction.reply({
            content: "ℹ️ Esta sugerencia ya fue resuelta.",
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferUpdate().catch(() => {});

    const updated = new EmbedBuilder(embed)
        .setColor(approved ? "#57F287" : "#ED4245")
        .spliceFields(0, 1, {
            name: "Estado",
            value: approved ? "✅ Aprobada" : "❌ Rechazada",
            inline: true
        })
        .addFields({
            name: "Revisada por",
            value: `<@${interaction.user.id}>`,
            inline: true
        });

    await message.edit({
        embeds: [updated],
        components: [buttons(id, newStatus)]
    });

    const sug = getSugerenciasConfig(config, guild.id);
    const logChannel = sug.logChannel ? guild.channels.cache.get(sug.logChannel) : null;
    if (logChannel) {
        await logChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(approved ? "#57F287" : "#ED4245")
                    .setTitle(approved ? "✅ Sugerencia aprobada" : "❌ Sugerencia rechazada")
                    .setDescription(
                        `**Sugerencia #${id}**\n\n> ${embed.description}\n\n` +
                        `Revisada por <@${interaction.user.id}>`
                    )
                    .setTimestamp()
            ]
        }).catch(() => {});
    }

    return interaction.editReply({
        content: approved ? "✅ Sugerencia aprobada." : "❌ Sugerencia rechazada."
    });
}

async function handleSugerenciasInteraction(interaction, config, saveConfig) {
    if (interaction.isCommand() && interaction.commandName === "sugerir") {
        await submitSuggestion(interaction, config, saveConfig);
        return true;
    }

    if (
        interaction.isButton() &&
        (interaction.customId?.startsWith("sugerir_aprob_") || interaction.customId?.startsWith("sugerir_rechaz_"))
    ) {
        await resolveSuggestion(interaction, config, saveConfig);
        return true;
    }

    return false;
}

module.exports = {
    handleSugerenciasInteraction
};
