const RssParser = require("rss-parser");
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");

const DEFAULTS = {
    enabled: false,
    intervalMinutes: 5,
    mentionType: "none",
    mentionRoleId: null,
    customMessage: "🎬 ¡Nuevo video de TikTok!",
    thumbnail: true,
    accounts: [],
    history: [],
    stats: {
        totalChecks: 0,
        totalNotifications: 0,
        errors: 0,
        lastCheck: null
    }
};

const MAX_HISTORY = 50;
const MAX_RETRIES = 2;
const CHECK_TIMEOUT_MS = 15000;

const rssParser = new RssParser({
    timeout: CHECK_TIMEOUT_MS,
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
});

let checkInterval = null;
let botClient = null;

function ensureTiktokConfig(gc) {
    if (!gc.tiktok) gc.tiktok = {};
    const t = gc.tiktok;
    if (t.enabled === undefined) t.enabled = DEFAULTS.enabled;
    if (t.intervalMinutes === undefined) t.intervalMinutes = DEFAULTS.intervalMinutes;
    if (t.mentionType === undefined) t.mentionType = DEFAULTS.mentionType;
    if (t.mentionRoleId === undefined) t.mentionRoleId = DEFAULTS.mentionRoleId;
    if (t.customMessage === undefined) t.customMessage = DEFAULTS.customMessage;
    if (t.thumbnail === undefined) t.thumbnail = DEFAULTS.thumbnail;
    if (!Array.isArray(t.accounts)) t.accounts = [];
    if (!Array.isArray(t.history)) t.history = [];
    if (!t.stats) t.stats = { ...DEFAULTS.stats };
    if (t.stats.totalChecks === undefined) t.stats.totalChecks = 0;
    if (t.stats.totalNotifications === undefined) t.stats.totalNotifications = 0;
    if (t.stats.errors === undefined) t.stats.errors = 0;
    if (t.stats.lastCheck === undefined) t.stats.lastCheck = null;
    for (const a of t.accounts) {
        if (a.enabled === undefined) a.enabled = true;
    }
    return gc;
}

function extractVideoId(item) {
    if (item.guid) return item.guid;
    if (item.id) return item.id;
    if (item.link) {
        const match = item.link.match(/video\/(\d+)/);
        if (match) return match[1];
        return item.link;
    }
    return null;
}

function extractThumbnail(item) {
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;
    if (item["media:thumbnail"] && item["media:thumbnail"]["$"]) {
        return item["media:thumbnail"]["$"].url;
    }
    if (item["media:content"] && item["media:content"]["$"]) {
        return item["media:content"]["$"].url;
    }
    if (item.content) {
        const imgMatch = item.content.match(/<img[^>]+src="([^"]+)"/);
        if (imgMatch) return imgMatch[1];
    }
    return null;
}

function extractDescription(item) {
    if (item.contentSnippet) {
        let desc = item.contentSnippet.trim();
        if (desc.length > 300) desc = desc.substring(0, 297) + "...";
        return desc;
    }
    if (item.content) {
        let desc = item.content.replace(/<[^>]+>/g, "").trim();
        if (desc.length > 300) desc = desc.substring(0, 297) + "...";
        return desc;
    }
    return "";
}

function parseMention(gc) {
    const type = gc.tiktok?.mentionType || "none";
    const roleId = gc.tiktok?.mentionRoleId;
    switch (type) {
        case "everyone": return "@everyone";
        case "here": return "@here";
        case "role": return roleId ? `<@&${roleId}>` : "";
        default: return "";
    }
}

function buildNotificationEmbed(video, account, gc) {
    const mention = parseMention(gc);
    const customMsg = gc.tiktok?.customMessage || DEFAULTS.customMessage;
    const useThumb = gc.tiktok?.thumbnail !== false;

    const embed = new EmbedBuilder()
        .setColor("#FF0050")
        .setTitle(`🎬 ${video.title || "Nuevo video de TikTok"}`)
        .setURL(video.url || "https://tiktok.com")
        .setDescription(video.description || "")
        .addFields(
            { name: "👤 Creador", value: `@${account.username}`, inline: true },
            { name: "📅 Publicado", value: video.date || "Desconocido", inline: true }
        )
        .setFooter({ text: "DRAGONS | TikTok Notificaciones" })
        .setTimestamp();

    if (useThumb && video.thumbnail) {
        embed.setThumbnail(video.thumbnail);
    }

    const content = mention ? `${mention}\n${customMsg}` : customMsg;

    return { content, embeds: [embed] };
}

async function fetchFeed(url, retries = 0) {
    try {
        const feed = await rssParser.parseURL(url);
        return feed;
    } catch (error) {
        if (retries < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 2000));
            return fetchFeed(url, retries + 1);
        }
        throw error;
    }
}

async function checkAccount(account, client, guildId, gc, saveConfig) {
    if (!account.rssFeedUrl) return null;
    if (account.enabled === false) return null;

    try {
        const feed = await fetchFeed(account.rssFeedUrl);
        if (!feed || !feed.items || feed.items.length === 0) return null;

        const latestItem = feed.items[0];
        const videoId = extractVideoId(latestItem);
        if (!videoId) return null;

        if (account.lastVideoId === videoId) return null;

        const video = {
            id: videoId,
            title: latestItem.title || "Sin título",
            url: latestItem.link || `https://www.tiktok.com/@${account.username}`,
            description: extractDescription(latestItem),
            thumbnail: extractThumbnail(latestItem),
            date: latestItem.isoDate
                ? new Date(latestItem.isoDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
                : latestItem.pubDate
                    ? new Date(latestItem.pubDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
                    : "Desconocido"
        };

        account.lastVideoId = videoId;

        const channel = client.channels.cache.get(account.channelId);
        if (!channel) {
            console.warn(`[TikTok] Canal no encontrado para @${account.username}: ${account.channelId}`);
            return null;
        }

        if (!channel.permissionsFor(client.user.id)?.has([
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks
        ])) {
            console.warn(`[TikTok] Sin permisos en canal para @${account.username}: ${account.channelId}`);
            return null;
        }

        const { content, embeds } = buildNotificationEmbed(video, account, gc);
        await channel.send({ content, embeds }).catch(err => {
            console.error(`[TikTok] Error enviando notificación:`, err.message);
        });

        if (!gc.tiktok.history) gc.tiktok.history = [];
        gc.tiktok.history.unshift({
            username: account.username,
            videoTitle: video.title,
            videoUrl: video.url,
            thumbnail: video.thumbnail,
            postedAt: video.date,
            notifiedAt: Date.now()
        });
        if (gc.tiktok.history.length > MAX_HISTORY) {
            gc.tiktok.history = gc.tiktok.history.slice(0, MAX_HISTORY);
        }

        gc.tiktok.stats.totalNotifications = (gc.tiktok.stats.totalNotifications || 0) + 1;

        return video;
    } catch (error) {
        console.error(`[TikTok] Error checking @${account.username}:`, error.message);
        gc.tiktok.stats.errors = (gc.tiktok.stats.errors || 0) + 1;
        return null;
    }
}

async function runCheck(client, config, saveConfig) {
    for (const [guildId, gc] of Object.entries(config)) {
        if (typeof gc !== "object" || gc === null) continue;
        if (!gc.tiktok?.enabled) continue;
        if (!gc.tiktok.accounts || gc.tiktok.accounts.length === 0) continue;

        for (const account of gc.tiktok.accounts) {
            await checkAccount(account, client, guildId, gc, saveConfig);
        }

        gc.tiktok.stats.totalChecks = (gc.tiktok.stats.totalChecks || 0) + 1;
        gc.tiktok.stats.lastCheck = Date.now();
        saveConfig();
    }
}

function startTiktokChecker(client, config, saveConfig) {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }

    let minInterval = Infinity;
    for (const gc of Object.values(config)) {
        if (typeof gc !== "object" || gc === null) continue;
        if (gc.tiktok?.enabled && gc.tiktok.accounts?.length > 0) {
            const interval = (gc.tiktok.intervalMinutes || DEFAULTS.intervalMinutes) * 60000;
            if (interval < minInterval) minInterval = interval;
        }
    }

    if (minInterval === Infinity) minInterval = 5 * 60000;
    if (minInterval < 60000) minInterval = 60000;

    checkInterval = setInterval(() => runCheck(client, config, saveConfig), minInterval);
    console.log(`[TikTok] Checker iniciado (intervalo: ${minInterval / 60000} min)`);
}

function stopTiktokChecker() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}

function tiktokView(gc) {
    const t = gc.tiktok || {};
    const enabled = t.enabled === true;
    const accounts = t.accounts || [];
    const stats = t.stats || DEFAULTS.stats;
    const interval = t.intervalMinutes || DEFAULTS.intervalMinutes;
    const mentionLabel = { none: "Ninguna", everyone: "@everyone", here: "@here", role: "Rol específico" }[t.mentionType] || "Ninguna";

    const embed = new EmbedBuilder()
        .setColor(enabled ? "#FF0050" : "#ED4245")
        .setTitle("📱 TIKTOK | Notificaciones")
        .setDescription(
            (enabled ? "🟢 **ESTADO: ACTIVO**" : "🔴 **ESTADO: DESACTIVADO**") +
            "\n\nRecibe notificaciones automáticas cuando se publiquen nuevos videos en TikTok."
        )
        .addFields(
            { name: "📊 Cuentas", value: `${accounts.length}`, inline: true },
            { name: "⏱️ Intervalo", value: `${interval} min`, inline: true },
            { name: "📢 Mención", value: mentionLabel, inline: true },
            { name: "🖼️ Miniatura", value: t.thumbnail !== false ? "Sí" : "No", inline: true },
            { name: "📝 Mensaje", value: (t.customMessage || DEFAULTS.customMessage).substring(0, 50), inline: true },
            { name: "🔍 Verificaciones", value: `${stats.totalChecks || 0}`, inline: true },
            { name: "📨 Notificaciones", value: `${stats.totalNotifications || 0}`, inline: true },
            { name: "❌ Errores", value: `${stats.errors || 0}`, inline: true },
            {
                name: "🕐 Última verificación",
                value: stats.lastCheck
                    ? `<t:${Math.floor(stats.lastCheck / 1000)}:R>`
                    : "Nunca",
                inline: true
            }
        )
        .setFooter({ text: "DRAGONS | Centro de control" });

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("panel_tiktok_accounts").setLabel("Cuentas").setStyle(ButtonStyle.Primary).setEmoji("👤"),
            new ButtonBuilder().setCustomId("panel_tiktok_add").setLabel("Agregar").setStyle(ButtonStyle.Success).setEmoji("➕"),
            new ButtonBuilder().setCustomId("panel_tiktok_history").setLabel("Historial").setStyle(ButtonStyle.Secondary).setEmoji("📋"),
            new ButtonBuilder().setCustomId("panel_tiktok_test").setLabel("Probar").setStyle(ButtonStyle.Secondary).setEmoji("🧪"),
            new ButtonBuilder().setCustomId("panel_back").setLabel("Volver").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("panel_cfg_tiktok").setLabel("Configurar").setStyle(ButtonStyle.Primary).setEmoji("⚙️"),
            new ButtonBuilder().setCustomId("panel_toggle_tiktok_on").setLabel("Activar").setStyle(ButtonStyle.Success).setEmoji("✅"),
            new ButtonBuilder().setCustomId("panel_toggle_tiktok_off").setLabel("Desactivar").setStyle(ButtonStyle.Danger).setEmoji("❌")
        )
    ];

    return { embeds: [embed], components: rows };
}

function tiktokAccountsView(gc) {
    const accounts = gc.tiktok?.accounts || [];

    if (accounts.length === 0) {
        const embed = new EmbedBuilder()
            .setColor("#FFA500")
            .setTitle("📱 TIKTOK | Cuentas monitoreadas")
            .setDescription("No hay cuentas configuradas.\n\nUsa el botón **➕ Agregar** para añadir una cuenta de TikTok.")
            .setFooter({ text: "DRAGONS | TikTok" });

        return {
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("panel_tiktok_add").setLabel("Agregar cuenta").setStyle(ButtonStyle.Success).setEmoji("➕"),
                    new ButtonBuilder().setCustomId("panel_tiktok_back").setLabel("Volver").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
                )
            ]
        };
    }

    const embed = new EmbedBuilder()
        .setColor("#FF0050")
        .setTitle("📱 TIKTOK | Cuentas monitoreadas")
        .setDescription(`Total: **${accounts.length}** cuenta(s)`)
        .setFooter({ text: "DRAGONS | TikTok" });

    accounts.forEach((a, i) => {
        const status = a.enabled !== false ? "🟢" : "🔴";
        embed.addFields({
            name: `${status} ${i + 1}. @${a.username}`,
            value:
                `📺 Canal: <#${a.channelId || "none"}>\n` +
                `🔗 RSS: ${a.rssFeedUrl ? "✅ Configurado" : "❌ Sin configurar"}\n` +
                `🆔 Último video: ${a.lastVideoId ? `\`${a.lastVideoId.substring(0, 16)}...\`` : "Ninguno"}`,
            inline: false
        });
    });

    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("panel_tiktok_add").setLabel("Agregar").setStyle(ButtonStyle.Success).setEmoji("➕"),
            new ButtonBuilder().setCustomId("panel_tiktok_back").setLabel("Volver").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
        )
    ];

    const toggleRow = new ActionRowBuilder();
    const removeRow = new ActionRowBuilder();

    accounts.forEach((a, i) => {
        if (toggleRow.components.length < 5) {
            toggleRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`panel_tiktok_toggle_account_${i}`)
                    .setLabel(a.enabled !== false ? `🔴 @${a.username}` : `🟢 @${a.username}`)
                    .setStyle(a.enabled !== false ? ButtonStyle.Danger : ButtonStyle.Success)
            );
        }
        if (removeRow.components.length < 5) {
            removeRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`panel_tiktok_remove_${i}`)
                    .setLabel(`🗑️ @${a.username}`)
                    .setStyle(ButtonStyle.Danger)
            );
        }
    });

    if (toggleRow.components.length > 0) components.push(toggleRow);
    if (removeRow.components.length > 0) components.push(removeRow);

    return { embeds: [embed], components };
}

function tiktokHistoryView(gc) {
    const history = gc.tiktok?.history || [];

    if (history.length === 0) {
        const embed = new EmbedBuilder()
            .setColor("#FFA500")
            .setTitle("📱 TIKTOK | Historial de notificaciones")
            .setDescription("No hay notificaciones enviadas aún.")
            .setFooter({ text: "DRAGONS | TikTok" });

        return {
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("panel_tiktok_back").setLabel("Volver").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
                )
            ]
        };
    }

    const recent = history.slice(0, 10);
    const embed = new EmbedBuilder()
        .setColor("#FF0050")
        .setTitle("📱 TIKTOK | Historial de notificaciones")
        .setDescription(recent.map((h, i) =>
            `**${i + 1}.** @${h.username} — [${h.videoTitle?.substring(0, 40) || "Sin título"}](${h.videoUrl || "https://tiktok.com"})\n` +
            `　　📅 ${h.postedAt || "N/A"} | 📨 <t:${Math.floor(h.notifiedAt / 1000)}:R>`
        ).join("\n\n"))
        .setFooter({ text: `DRAGONS | Mostrando ${recent.length} de ${history.length}` });

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("panel_tiktok_clear_history").setLabel("Limpiar historial").setStyle(ButtonStyle.Danger).setEmoji("🗑️"),
                new ButtonBuilder().setCustomId("panel_tiktok_back").setLabel("Volver").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
            )
        ]
    };
}

function tiktokAddModal() {
    const m = new ModalBuilder()
        .setCustomId("panel_modal_tiktok_add")
        .setTitle("➕ Agregar cuenta de TikTok");

    const row = (field) => new ActionRowBuilder().addComponents(field);

    m.addComponents(
        row(new TextInputBuilder()
            .setCustomId("tiktokUsername")
            .setLabel("Usuario de TikTok (sin @)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("ej: tiktok")),
        row(new TextInputBuilder()
            .setCustomId("tiktokRssUrl")
            .setLabel("URL del feed RSS (de rss.app)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("https://rss.app/feed/v1.1/...")),
        row(new TextInputBuilder()
            .setCustomId("tiktokChannelId")
            .setLabel("Canal de notificaciones (ID)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("1234567890123456789"))
    );

    return m;
}

function tiktokConfigModal(gc) {
    const t = gc.tiktok || {};

    const m = new ModalBuilder()
        .setCustomId("panel_modal_tiktok_config")
        .setTitle("⚙️ Configurar TikTok");

    const row = (field) => new ActionRowBuilder().addComponents(field);

    m.addComponents(
        row(new TextInputBuilder()
            .setCustomId("tiktokInterval")
            .setLabel("Intervalo de verificación (minutos)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(t.intervalMinutes || DEFAULTS.intervalMinutes))),
        row(new TextInputBuilder()
            .setCustomId("tiktokMentionType")
            .setLabel("Mención: none / everyone / here / role")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(t.mentionType || "none")),
        row(new TextInputBuilder()
            .setCustomId("tiktokMentionRole")
            .setLabel("ID del rol (si mención = role)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(t.mentionRoleId || "")),
        row(new TextInputBuilder()
            .setCustomId("tiktokMessage")
            .setLabel("Mensaje de notificación")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(t.customMessage || DEFAULTS.customMessage)),
        row(new TextInputBuilder()
            .setCustomId("tiktokThumbnail")
            .setLabel("Miniatura: sí / no")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(t.thumbnail !== false ? "sí" : "no"))
    );

    return m;
}

async function handleTiktokInteraction(interaction, config, saveConfig) {
    if (!botClient) {
        console.error("[TikTok] botClient no inicializado");
        await interaction.reply({ content: "❌ Sistema TikTok no inicializado.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const id = interaction.customId;
    if (!id || !id.startsWith("panel_tiktok")) return false;

    try {
        const guild = interaction.guild;
        if (!guild) return false;
        const gc = ensureTiktokConfig(config[guild.id] || {});

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: "❌ Solo los administradores pueden configurar TikTok.", flags: MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }

        if (id === "panel_tiktok_accounts") {
            await interaction.update(tiktokAccountsView(gc));
            return true;
        }

        if (id === "panel_tiktok_add") {
            await interaction.showModal(tiktokAddModal()).catch(err => {
                console.error("[TikTok] Error abriendo modal agregar:", err.message);
            });
            return true;
        }

        if (id === "panel_tiktok_history") {
            await interaction.update(tiktokHistoryView(gc));
            return true;
        }

        if (id === "panel_tiktok_test") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(err => {
                console.error("[TikTok] Error en deferReply test:", err.message);
            });

            if (!gc.tiktok.accounts || gc.tiktok.accounts.length === 0) {
                await interaction.editReply({ content: "⚠️ No hay cuentas configuradas." }).catch(err => {
                    console.error("[TikTok] Error editReply test empty:", err.message);
                });
                return true;
            }

            let tested = 0;
            let errors = 0;
            for (const account of gc.tiktok.accounts) {
                if (!account.channelId) {
                    console.warn(`[TikTok] Test: cuenta @${account.username} sin channelId`);
                    errors++;
                    continue;
                }
                const channel = botClient.channels.cache.get(account.channelId);
                if (!channel) {
                    console.warn(`[TikTok] Test: canal ${account.channelId} no encontrado para @${account.username}`);
                    errors++;
                    continue;
                }

                const testEmbed = new EmbedBuilder()
                    .setColor("#FF0050")
                    .setTitle("🧪 Test de notificación TikTok")
                    .setDescription(`Esta es una notificación de prueba para **@${account.username}**.\nSi ves esto, el sistema está funcionando correctamente.`)
                    .addFields(
                        { name: "👤 Cuenta", value: `@${account.username}`, inline: true },
                        { name: "📺 Canal", value: `<#${account.channelId}>`, inline: true }
                    )
                    .setFooter({ text: "DRAGONS | TikTok Test" })
                    .setTimestamp();

                try {
                    await channel.send({ embeds: [testEmbed] });
                    tested++;
                } catch (sendErr) {
                    console.error(`[TikTok] Test error enviando a @${account.username}:`, sendErr.message);
                    errors++;
                }
            }

            await interaction.editReply({
                content: `✅ Prueba completada: **${tested}** notificación(es) enviada(s), **${errors}** error(es).`
            }).catch(err => {
                console.error("[TikTok] Error editReply test result:", err.message);
            });
            return true;
        }

        if (id === "panel_tiktok_back") {
            await interaction.update(tiktokView(gc));
            return true;
        }

        if (id === "panel_tiktok_clear_history") {
            gc.tiktok.history = [];
            saveConfig();
            await interaction.update(tiktokHistoryView(gc));
            return true;
        }

        const toggleAccountMatch = /^panel_tiktok_toggle_account_(\d+)$/.exec(id);
        if (toggleAccountMatch) {
            const idx = parseInt(toggleAccountMatch[1]);
            if (gc.tiktok.accounts && gc.tiktok.accounts[idx]) {
                const acc = gc.tiktok.accounts[idx];
                acc.enabled = acc.enabled === false ? true : false;
                saveConfig();
                console.log(`[TikTok] Cuenta @${acc.username} ${acc.enabled ? "activada" : "desactivada"}`);
                await interaction.update(tiktokAccountsView(gc)).catch(err => {
                    console.error("[TikTok] Error update toggle account:", err.message);
                });
            }
            return true;
        }

        const removeMatch = /^panel_tiktok_remove_(\d+)$/.exec(id);
        if (removeMatch) {
            const idx = parseInt(removeMatch[1]);
            if (gc.tiktok.accounts && gc.tiktok.accounts[idx]) {
                const removed = gc.tiktok.accounts.splice(idx, 1)[0];
                saveConfig();
                console.log(`[TikTok] Cuenta @${removed.username} eliminada`);
                await interaction.update({
                    content: `✅ Cuenta **@${removed.username}** eliminada.`,
                    ...tiktokAccountsView(gc)
                }).catch(err => {
                    console.error("[TikTok] Error update remove:", err.message);
                });
            }
            return true;
        }

        return false;
    } catch (error) {
        console.error("[TikTok] Error en handleTiktokInteraction:", error.message, error.stack || "");
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `❌ Error TikTok: ${error.message}`.substring(0, 200), flags: MessageFlags.Ephemeral });
            }
        } catch {}
        return true;
    }
}

async function handleTiktokModal(interaction, config, saveConfig) {
    if (!botClient) {
        console.error("[TikTok] botClient no inicializado (modal)");
        await interaction.reply({ content: "❌ Sistema TikTok no inicializado.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const id = interaction.customId;
    if (!id || !id.startsWith("panel_modal_tiktok")) return false;

    try {
        const guild = interaction.guild;
        if (!guild) return false;
        const gc = ensureTiktokConfig(config[guild.id] || {});
        const v = (fieldId) => interaction.fields.getTextInputValue(fieldId)?.trim();

        if (id === "panel_modal_tiktok_add") {
            const username = v("tiktokUsername")?.replace(/^@/, "");
            const rssUrl = v("tiktokRssUrl");
            const channelId = v("tiktokChannelId")?.replace(/[<#>]/g, "");

            if (!username || !rssUrl || !channelId) {
                await interaction.reply({ content: "❌ Todos los campos son obligatorios.", flags: MessageFlags.Ephemeral });
                return true;
            }

            if (!/^\d{17,20}$/.test(channelId)) {
                await interaction.reply({ content: "❌ El ID del canal no es válido. Debe ser un número de 17-20 dígitos.", flags: MessageFlags.Ephemeral });
                return true;
            }

            const channel = botClient.channels.cache.get(channelId);
            if (!channel) {
                await interaction.reply({ content: "❌ No se encontró el canal especificado. Verifica el ID.", flags: MessageFlags.Ephemeral });
                return true;
            }

            if (!channel.permissionsFor(botClient.user.id)?.has([
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.EmbedLinks
            ])) {
                await interaction.reply({
                    content: "❌ El bot no tiene permisos de envío de mensajes y embeds en ese canal.",
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }

            const existing = gc.tiktok.accounts.find(a => a.username.toLowerCase() === username.toLowerCase());
            if (existing) {
                await interaction.reply({ content: `❌ La cuenta **@${username}** ya está agregada.`, flags: MessageFlags.Ephemeral });
                return true;
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            let feedValid = false;
            try {
                const feed = await fetchFeed(rssUrl);
                if (feed && feed.items && feed.items.length > 0) {
                    feedValid = true;
                }
            } catch (feedErr) {
                console.error(`[TikTok] Feed validation error for @${username}:`, feedErr.message);
                feedValid = false;
            }

            if (!feedValid) {
                await interaction.editReply({
                    content: "❌ No se pudo acceder al feed RSS. Verifica la URL y vuelve a intentar.\n\n" +
                        "📌 **Cómo obtener tu feed RSS:**\n" +
                        "1. Ve a [rss.app](https://rss.app)\n" +
                        "2. Crea una cuenta gratuita\n" +
                        "3. Haz clic en \"Create Feed\" → selecciona TikTok\n" +
                        "4. Pega la URL del perfil de TikTok\n" +
                        "5. Copia la URL del feed generado"
                });
                return true;
            }

            gc.tiktok.accounts.push({
                username,
                rssFeedUrl: rssUrl,
                channelId,
                lastVideoId: null,
                addedAt: Date.now(),
                enabled: true
            });
            saveConfig();

            console.log(`[TikTok] Cuenta @${username} agregada, canal: ${channelId}`);

            await interaction.editReply({
                content: `✅ Cuenta **@${username}** agregada correctamente.\n📺 Canal: <#${channelId}>\n🔍 El sistema verificará nuevos videos cada **${gc.tiktok.intervalMinutes || DEFAULTS.intervalMinutes}** minutos.`
            });
            return true;
        }

        if (id === "panel_modal_tiktok_config") {
            const interval = parseInt(v("tiktokInterval"));
            const mentionType = v("tiktokMentionType")?.toLowerCase();
            const mentionRole = v("tiktokMentionRole")?.replace(/[<@&>]/g, "");
            const message = v("tiktokMessage");
            const thumbnail = v("tiktokThumbnail")?.toLowerCase();

            if (isNaN(interval) || interval < 1 || interval > 1440) {
                await interaction.reply({ content: "❌ El intervalo debe ser un número entre 1 y 1440 minutos.", flags: MessageFlags.Ephemeral });
                return true;
            }

            if (!["none", "everyone", "here", "role"].includes(mentionType)) {
                await interaction.reply({ content: "❌ Tipo de mención inválido. Usa: none, everyone, here o role.", flags: MessageFlags.Ephemeral });
                return true;
            }

            if (mentionType === "role" && mentionRole && !/^\d{17,20}$/.test(mentionRole)) {
                await interaction.reply({ content: "❌ El ID del rol no es válido.", flags: MessageFlags.Ephemeral });
                return true;
            }

            gc.tiktok.intervalMinutes = interval;
            gc.tiktok.mentionType = mentionType;
            gc.tiktok.mentionRoleId = mentionType === "role" ? (mentionRole || null) : null;
            if (message) gc.tiktok.customMessage = message;
            gc.tiktok.thumbnail = thumbnail === "sí" || thumbnail === "si";

            saveConfig();

            startTiktokChecker(botClient, config, saveConfig);

            console.log(`[TikTok] Configuración actualizada: intervalo=${interval}m, mención=${mentionType}`);

            await interaction.reply({ content: "✅ Configuración de TikTok actualizada.", flags: MessageFlags.Ephemeral });
            return true;
        }

        return false;
    } catch (error) {
        console.error("[TikTok] Error en handleTiktokModal:", error.message, error.stack || "");
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `❌ Error TikTok: ${error.message}`.substring(0, 200), flags: MessageFlags.Ephemeral });
            }
        } catch {}
        return true;
    }
}

function setupTiktokSystem(client, config, saveConfig) {
    botClient = client;

    for (const guildId of Object.keys(config)) {
        if (typeof config[guildId] !== "object" || config[guildId] === null) continue;
        ensureTiktokConfig(config[guildId]);
    }
    saveConfig();

    startTiktokChecker(client, config, saveConfig);
}

module.exports = {
    ensureTiktokConfig,
    tiktokView,
    tiktokAccountsView,
    tiktokHistoryView,
    tiktokAddModal,
    tiktokConfigModal,
    handleTiktokInteraction,
    handleTiktokModal,
    setupTiktokSystem,
    startTiktokChecker,
    stopTiktokChecker
};
