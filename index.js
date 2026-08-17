require("dotenv").config();

const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    ModalBuilder,
    TextInputBuilder,
    PermissionFlagsBits,
    MessageFlags,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("./config.json");
const moderation = require("./moderation");
const logSystem = require("./logSystem");
const welcomeSystem = require("./welcomeSystem");
const panelSystem = require("./panelSystem");
const giveawaySystem = require("./giveawaySystem");
const ttsSystem = require("./ttsSystem");
const sugerenciasSystem = require("./sugerenciasSystem");
const funSystem = require("./funSystem");
const encuestaSystem = require("./encuestaSystem");
const securitySystem = require("./securitySystem");
const userinfoSystem = require("./userinfoSystem");
const musicSystem = require("./musicSystem");
const aiSystem = require("./aiSystem");
const recruitmentSystem = require("./recruitmentSystem");
const tiktokSystem = require("./tiktokSystem");

const TRANSCRIPTS_DIR = path.join(__dirname, "transcripts");

// ===== LOCK DE INSTANCIA ÚNICA =====
const LOCK_FILE = path.join(__dirname, "bot.lock");

function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === "EPERM";
    }
}

function releaseLock() {
    try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
        if (lock.pid === process.pid) {
            fs.unlinkSync(LOCK_FILE);
        }
    } catch {
        // Si no existe o no se puede leer, no hay nada que liberar.
    }
}

function findOtherBotInstances() {
    let tempFile = null;
    try {
        const { execSync } = require("child_process");
        const os = require("os");
        tempFile = path.join(os.tmpdir(), `bot-instances-check-${process.pid}.ps1`);
        fs.writeFileSync(tempFile, [
            `$currentPid = ${process.pid}`,
            `$parentPid = ${process.ppid}`,
            "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object {",
            "    $_.CommandLine -like '*index.js*' -and",
            "    $_.ProcessId -ne $currentPid -and",
            "    $_.ParentProcessId -ne $parentPid",
            "} | Select-Object -ExpandProperty ProcessId"
        ].join("\n"));
        const output = execSync(
            `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tempFile}"`,
            { encoding: "utf8", timeout: 5000 }
        ).toString().trim();
        return output.split(/\s+/).map(Number).filter(Boolean);
    } catch {
        return [];
    } finally {
        if (tempFile) {
            try { fs.unlinkSync(tempFile); } catch { /* noop */ }
        }
    }
}

function acquireLock() {
    const others = findOtherBotInstances();
    if (others.length) {
        console.error(
            `❌ Ya hay otra instancia del bot corriendo (PID: ${others.join(", ")}).\n` +
            "Cierra esa instancia antes de iniciar otra para evitar bienvenidas y logs duplicados."
        );
        process.exit(1);
    }

    try {
        if (fs.existsSync(LOCK_FILE)) {
            const lock = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
            if (lock.pid && isProcessAlive(lock.pid)) {
                console.error(
                    `❌ Ya hay una instancia del bot corriendo (PID ${lock.pid}).\n` +
                    "Cierra esa instancia antes de iniciar otra para evitar bienvenidas y logs duplicados."
                );
                process.exit(1);
            }
            fs.unlinkSync(LOCK_FILE);
        }

        fs.writeFileSync(
            LOCK_FILE,
            JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })
        );
    } catch (error) {
        console.error("⚠️ No se pudo crear el archivo de bloqueo:", error.message);
    }
}

acquireLock();

process.on("exit", releaseLock);
process.on("SIGINT", () => {
    releaseLock();
    process.exit(0);
});
process.on("SIGTERM", () => {
    releaseLock();
    process.exit(0);
});

function sanitizeChannelName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "usuario";
}

function saveConfig() {
    fs.writeFileSync(path.join(__dirname, "config.json"), JSON.stringify(config, null, 4));
}

function getTicketInfo(topic) {
    if (!topic) return null;

    if (topic.startsWith("ticket-owner:")) {
        return {
            ownerId: topic.slice("ticket-owner:".length),
            category: null,
            claimedBy: null
        };
    }

    if (!topic.startsWith("ticket|")) return null;

    const parts = Object.fromEntries(
        topic
            .slice("ticket|".length)
            .split("|")
            .map(part => {
                const [key, ...value] = part.split(":");
                return [key, value.join(":")];
            })
    );

    return {
        ownerId: parts.owner || null,
        category: parts.cat || null,
        claimedBy: parts.claimed || null
    };
}

function buildTicketTopic(ownerId, category, claimedBy = null) {
    let topic = `ticket|owner:${ownerId}|cat:${category}`;
    if (claimedBy) topic += `|claimed:${claimedBy}`;
    return topic;
}

function isTicketChannel(channel) {
    return Boolean(
        channel?.topic?.startsWith("ticket|") ||
        channel?.topic?.startsWith("ticket-owner:")
    );
}

function isTicketStaff(member, guildConfig) {
    if (member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return true;
    }

    if (guildConfig?.staffRole && member.roles.cache.has(guildConfig.staffRole)) {
        return true;
    }

    return false;
}

function buildTicketActionRows(claimedBy = null) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("reclamar_ticket")
                .setLabel(claimedBy ? "Reclamado" : "Reclamar")
                .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setEmoji("🙋")
                .setDisabled(Boolean(claimedBy)),
            new ButtonBuilder()
                .setCustomId("añadir_usuario_ticket")
                .setLabel("Añadir usuario")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("➕"),
            new ButtonBuilder()
                .setCustomId("cerrar_ticket")
                .setLabel("Cerrar ticket")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔒")
        )
    ];
}

function buildCloseConfirmationRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("confirmar_cierre_ticket")
            .setLabel("Sí, cerrar ticket")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("✅"),
        new ButtonBuilder()
            .setCustomId("cancelar_cierre_ticket")
            .setLabel("Cancelar")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("❌")
    );
}

function buildTicketPermissionOverwrites(guild, userId, botId, staffRoleId) {
    const overwrites = [
        {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
            id: userId,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles
            ]
        },
        {
            id: botId,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ManageMessages
            ]
        }
    ];

    if (staffRoleId) {
        overwrites.push({
            id: staffRoleId,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.ManageMessages
            ]
        });
    }

    return overwrites;
}

async function fetchAllMessages(channel) {
    const messages = [];
    let lastId;

    while (true) {
        const fetched = await channel.messages.fetch({
            limit: 100,
            ...(lastId && { before: lastId })
        });

        if (fetched.size === 0) break;

        messages.push(...fetched.values());
        lastId = fetched.last().id;

        if (fetched.size < 100) break;
    }

    return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function buildTicketTranscript(channel, ticketInfo, closedBy) {
    const messages = await fetchAllMessages(channel);
    const owner = ticketInfo.ownerId
        ? await channel.client.users.fetch(ticketInfo.ownerId).catch(() => null)
        : null;
    const claimer = ticketInfo.claimedBy
        ? await channel.client.users.fetch(ticketInfo.claimedBy).catch(() => null)
        : null;

    let transcript = [
        `Transcript del ticket #${channel.name}`,
        `Servidor: ${channel.guild.name} (${channel.guild.id})`,
        `Canal: ${channel.id}`,
        `Propietario: ${owner ? `${owner.tag} (${owner.id})` : ticketInfo.ownerId || "Desconocido"}`,
        `Categoria: ${ticketInfo.category || "Sin categoria"}`,
        `Reclamado por: ${claimer ? `${claimer.tag} (${claimer.id})` : "Nadie"}`,
        `Cerrado por: ${closedBy.tag} (${closedBy.id})`,
        `Cerrado el: ${new Date().toISOString()}`,
        `${"=".repeat(50)}`,
        ""
    ].join("\n");

    for (const message of messages) {
        const content = message.content || "[sin texto]";
        transcript += `[${message.createdAt.toISOString()}] ${message.author.tag} (${message.author.id}): ${content}\n`;

        message.attachments.forEach(attachment => {
            transcript += `  Adjunto: ${attachment.url}\n`;
        });

        if (message.embeds.length > 0) {
            transcript += `  Embed: ${message.embeds[0].title || message.embeds[0].description || "sin titulo"}\n`;
        }

        transcript += "\n";
    }

    return { transcript, messageCount: messages.length };
}

async function sendTicketTranscript(channel, ticketInfo, closedBy, guildConfig) {
    const { transcript, messageCount } = await buildTicketTranscript(channel, ticketInfo, closedBy);
    const fileName = `${channel.name}-${Date.now()}.txt`;

    if (!fs.existsSync(TRANSCRIPTS_DIR)) {
        fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    }

    const filePath = path.join(TRANSCRIPTS_DIR, fileName);
    fs.writeFileSync(filePath, transcript, "utf8");

    const attachment = new AttachmentBuilder(filePath, { name: fileName });
    const owner = ticketInfo.ownerId
        ? await channel.client.users.fetch(ticketInfo.ownerId).catch(() => null)
        : null;
    const claimer = ticketInfo.claimedBy
        ? await channel.client.users.fetch(ticketInfo.claimedBy).catch(() => null)
        : null;

    const logEmbed = new EmbedBuilder()
        .setColor("#8A2BE2")
        .setTitle("Ticket cerrado")
        .addFields(
            { name: "Canal", value: `#${channel.name}`, inline: true },
            { name: "Usuario", value: owner ? `${owner}` : "Desconocido", inline: true },
            { name: "Categoria", value: ticketInfo.category || "Sin categoria", inline: true },
            { name: "Reclamado por", value: claimer ? `${claimer}` : "Nadie", inline: true },
            { name: "Cerrado por", value: `${closedBy}`, inline: true },
            { name: "Mensajes", value: `${messageCount}`, inline: true }
        )
        .setTimestamp();

    if (guildConfig?.transcriptChannel) {
        const logChannel = channel.guild.channels.cache.get(guildConfig.transcriptChannel);

        if (logChannel) {
            await logChannel.send({
                embeds: [logEmbed],
                files: [attachment]
            });
        }
    }

    return { filePath, messageCount };
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ]
});

client.once("clientReady", () => {
    console.log(`Bot conectado como ${client.user.tag} (PID: ${process.pid})`);
});

logSystem.setupLogSystem(client, config, saveConfig);

giveawaySystem.setupGiveaways(client, config, saveConfig);

encuestaSystem.setupEncuestas(client, config, saveConfig);

securitySystem.setupSecurity(client, config, saveConfig);

musicSystem.setupMusicSystem(client);

aiSystem.setupAISystem(client, config, saveConfig);

recruitmentSystem.setupRecruitmentSystem(client, config, saveConfig);

tiktokSystem.setupTiktokSystem(client, config, saveConfig);


client.on("guildMemberAdd", member => {
    securitySystem.handleGuildMemberAdd(member, config, saveConfig).catch(() => {});

    panelSystem.applyAutoRoles(member, config);

    console.log(`${member.user.tag} entró al servidor.`);

    welcomeSystem.sendWelcome(client, config, saveConfig, member.guild, member);
});

client.on("messageCreate", async message => {
    await securitySystem.handleMessage(message, config, saveConfig);

    ttsSystem.handleTTSMessage(message, config).catch(() => {});

    if (message.author.bot) return;

    // DRAGONS AI
    aiSystem.handleMessage(message, config, saveConfig).catch(() => {});

    // RECLUTAMIENTO - Entrevistas
    recruitmentSystem.handleInterviewMessage(message, config).catch(() => {});

    // COMANDO HOLA
    if (message.content === "!xd") {
        message.reply(":uf_uf:");
    }


    // KICK
    if (message.content.startsWith("!kick")) {

        if (!message.member.permissions.has("KickMembers")) {
            return message.reply("❌ No tienes permiso para usar este comando.");
        }

        const usuario = message.mentions.members.first();

        if (!usuario) {
            return message.reply("❌ Menciona a un usuario.");
        }

        await usuario.kick();

        message.reply(`✅ ${usuario.user.tag} fue expulsado.`);
    }


    // BAN
    if (message.content.startsWith("!ban")) {

        if (!message.member.permissions.has("BanMembers")) {
            return message.reply("❌ No tienes permiso para usar este comando.");
        }

        const usuario = message.mentions.members.first();

        if (!usuario) {
            return message.reply("❌ Menciona a un usuario.");
        }

        await usuario.ban();

        message.reply(`🔨 ${usuario.user.tag} fue baneado.`);
    }


    // BORRAR MENSAJES
    if (message.content.startsWith("!clear")) {

        if (!message.member.permissions.has("ManageMessages")) {
            return message.reply("❌ No tienes permiso.");
        }

        const cantidad = Number(message.content.split(" ")[1]);

        if (!cantidad) {
            return message.reply("❌ Pon una cantidad. Ejemplo: !clear 10");
        }

        await message.channel.bulkDelete(cantidad);

        message.channel.send(`🧹 Se borraron ${cantidad} mensajes.`);
        }

    });

    client.on("interactionCreate", async interaction => {
    try {
        const _t = Date.now();
        const _type = interaction.type;
        const _cid = interaction.customId || null;
        const _cmd = interaction.commandName || null;
        const _user = interaction.user?.tag || interaction.user?.id || "?";
        console.log(`[INTERACTION:IN] type=${_type} customId=${_cid} cmd=${_cmd} user=${_user} ts=${new Date().toISOString()}`);

        if (await panelSystem.handlePanelInteraction(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by panelSystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await giveawaySystem.handleGiveawayInteraction(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by giveawaySystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await ttsSystem.handleTTSInteraction(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by ttsSystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await sugerenciasSystem.handleSugerenciasInteraction(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by sugerenciasSystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await moderation.handleModerationCommand(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by moderation in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await welcomeSystem.handleWelcomeCommand(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by welcomeSystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await funSystem.handleFunInteraction(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by funSystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await encuestaSystem.handleEncuestaInteraction(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by encuestaSystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await securitySystem.handleSecurityInteraction(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by securitySystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await userinfoSystem.handleUserInfoInteraction(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by userinfoSystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        if (await musicSystem.handleMusicInteraction(interaction, config, saveConfig)) {
            console.log(`[INTERACTION:OUT] handled by musicSystem in ${Date.now()-_t}ms customId=${_cid}`);
            return;
        }

        // RECLUTAMIENTO
        if (interaction.customId?.startsWith("recruitment_")) {
            if (await recruitmentSystem.handleInteraction(interaction, config, saveConfig, client)) {
                console.log(`[INTERACTION:OUT] handled by recruitmentSystem in ${Date.now()-_t}ms customId=${_cid}`);
                return;
            }
        }

        if (interaction.commandName === "hola") {

            return interaction.reply("¡Hola! Soy DRAGONS | BOT 🐉");

        }

if (interaction.commandName === "bienvenida") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
            content: "❌ Solo los administradores pueden usar este comando.",
            flags: MessageFlags.Ephemeral
        });
    }

    const canal = interaction.options.getChannel("canal");

    if (!config[interaction.guild.id]) {
        config[interaction.guild.id] = {};
    }

    config[interaction.guild.id].welcomeChannel = canal.id;

    if (!config[interaction.guild.id].welcome) {
        config[interaction.guild.id].welcome = {};
    }

    config[interaction.guild.id].welcome.channel = canal.id;
    config[interaction.guild.id].welcome.enabled = true;

    saveConfig();

    return interaction.reply({
        content: `✅ Canal de bienvenida configurado: ${canal}`
    });

}

if (interaction.commandName === "setticket") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
            content: "❌ Solo los administradores pueden usar este comando.",
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const canal = interaction.options.getChannel("canal");
    const categoria = interaction.options.getChannel("categoria");
    const rolStaff = interaction.options.getRole("rol_staff");
    const canalLogs = interaction.options.getChannel("canal_logs");
    const texto = interaction.options.getString("texto") ||
        config[interaction.guild.id]?.tickets?.panelMessage || null;

    if (!config[interaction.guild.id]) {
        config[interaction.guild.id] = {};
    }

    config[interaction.guild.id].ticketChannel = canal.id;
    config[interaction.guild.id].ticketCategory = categoria.id;

    if (rolStaff) {
        config[interaction.guild.id].staffRole = rolStaff.id;
    }

    if (canalLogs) {
        config[interaction.guild.id].transcriptChannel = canalLogs.id;
    }

    saveConfig();

    const embed = new EmbedBuilder()
    .setColor("#8A2BE2")
    .setTitle("🎫 Soporte DRAGONS")
    .setDescription(
        "¿Necesitas ayuda?\n\n" +
        "Pulsa el botón de abajo para crear un ticket."
    );

const boton = new ActionRowBuilder()
.addComponents(
    new StringSelectMenuBuilder()
        .setCustomId("crear_ticket")
        .setPlaceholder("📂 Selecciona una categoría")
        .addOptions(
            {
                label: "Reportar Jugador",
                description: "Reporta a un jugador",
                emoji: "🛡️",
                value: "reportar"
            },
            {
                label: "Dudas",
                description: "Resolvemos tus dudas",
                emoji: "❓",
                value: "dudas"
            },
            {
                label: "Reportar Bugs",
                description: "Reporta un bug",
                emoji: "🐛",
                value: "bugs"
            },
            {
                label: "Apelación",
                description: "Solicita una apelación",
                emoji: "⚖️",
                value: "apelacion"
            },
            {
                label: "Alianza",
                description: "Solicita una alianza",
                emoji: "🤝",
                value: "alianza"
            }
        )
        .setPlaceholder("Select an option")
);

const descripcionPanel = texto?.trim()
    ? texto.replace(/\\n/g, "\n")
    : [
        "## SISTEMA DE TICKETS 📌",
        "---",
        "",
        "👑 **DRAGONS | PANEL DE SOPORTE** 👑",
        "",
        "¡Bienvenido al centro de asistencia de **DRAGONS**! Selecciona la categoría que mejor describa tu solicitud para abrir un ticket.",
        "",
        "📌 **Opciones disponibles**",
        "",
        "• 🛡️ **Reportar Jugador**",
        "*Reporta infracciones a las normas. Adjunta capturas o videos como prueba.*",
        "",
        "• ❓ **Dudas**",
        "*Consulta sobre el servidor, sus normas o sus mecánicas.*",
        "",
        "• 🐛 **Reportar Bugs**",
        "*Informa errores o fallos para que el equipo técnico pueda revisarlos.*",
        "",
        "• ⚖️ **Apelación**",
        "*Solicita la revisión de una sanción con respeto y claridad.*",
        "",
        "• 🤝 **Alianza**",
        "*Envía propuestas de colaboración o alianzas para la administración.*",
        "",
        "---",
        "",
        "> ⚠️ **Nota:** Describe tu caso con detalle y evita mencionar al staff innecesariamente."
    ].join("\n");

const panelComoTicketKing = [
    "## SISTEMA DE TICKETS 📌",
    "---",
    "",
    "👑 **DRAGONS | PANEL DE SOPORTE** 👑",
    "",
    "¡Bienvenido al centro de asistencia de **DRAGONS**! Por favor, selecciona la categoría que mejor se adapte a tu necesidad para abrir un ticket. Nuestro equipo te atenderá lo antes posible.",
    "",
    "📌 **Opciones Disponibles:**",
    "",
    "• 🛡️ **Reportar Jugador**",
    "*Si encontraste a alguien incumpliendo las reglas, usando hacks o teniendo un comportamiento tóxico, repórtalo aquí. Adjunta pruebas, como capturas o videos.*",
    "",
    "• ❓ **Dudas**",
    "*¿Tienes preguntas sobre el servidor, mecánicas o cómo funciona algo? Abre un ticket y resolveremos tus inquietudes.*",
    "",
    "• 🐛 **Reportar Bugs**",
    "*¿Encontraste un error o fallo en el sistema? Detalla el problema para que el equipo técnico pueda solucionarlo.*",
    "",
    "• ⚖️ **Apelación**",
    "*¿Fuiste sancionado o baneado y consideras que fue un error? Presenta tu caso de forma honesta en esta sección.*",
    "",
    "• 🤝 **Hacer Alianza**",
    "*¿Representas a otra comunidad o quieres proponer una colaboración? Abre este ticket para hablar con la administración.*",
    "",
    "---",
    "",
    "> ⚠️ **Nota:** Sé paciente tras abrir tu ticket. Evita etiquetar al staff innecesariamente para que podamos atenderte más rápido. ¡Gracias por ayudarnos a mejorar la comunidad!"
].join("\n");

const panelEmbed = new EmbedBuilder()
    .setColor("#A52BE2")
    .setDescription(texto?.trim() ? descripcionPanel : panelComoTicketKing)
    .setFooter({ text: "Powered by Dragons Mc" });

// Elimina paneles anteriores de tickets en este mismo canal.
const mensajes = await canal.messages.fetch({ limit: 100 });
const panelesAnteriores = mensajes.filter(mensaje =>
    mensaje.author.id === client.user.id &&
    mensaje.components.some(fila =>
        fila.components.some(componente => componente.customId === "crear_ticket")
    )
);

await Promise.all(
    panelesAnteriores.map(panel => panel.delete().catch(console.error))
);

await canal.send({
    embeds: [panelEmbed],
    components: [boton]
});

return interaction.editReply({
    content: [
        "✅ Sistema de tickets configurado.",
        `📌 Canal: ${canal}`,
        `📁 Categoría: ${categoria}`,
        rolStaff ? `🛡️ Rol staff: ${rolStaff}` : "🛡️ Rol staff: no configurado",
        canalLogs ? `📄 Logs: ${canalLogs}` : "📄 Logs: no configurado"
    ].join("\n")
});
}

if (interaction.commandName === "embed") {

    const modal = new ModalBuilder()
        .setCustomId("modal_embed")
        .setTitle("Crear Embed");

    const titulo = new TextInputBuilder()
        .setCustomId("titulo")
        .setLabel("📝 Título")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const texto = new TextInputBuilder()
        .setCustomId("texto")
        .setLabel("📄 Texto")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    const color = new TextInputBuilder()
        .setCustomId("color")
        .setLabel("🎨 Color (#8A2BE2)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    const imagen = new TextInputBuilder()
        .setCustomId("imagen")
        .setLabel("🖼️ URL de la imagen")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titulo),
        new ActionRowBuilder().addComponents(texto),
        new ActionRowBuilder().addComponents(color),
        new ActionRowBuilder().addComponents(imagen)
    );

return interaction.showModal(modal);

} // Cierra el if (interaction.commandName === "embed"

if (interaction.isModalSubmit()) {

console.log("📨 Modal recibido");

    if (interaction.customId === "modal_embed") {

        console.log("✅ Entró al modal_embed");

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const titulo = interaction.fields.getTextInputValue("titulo");
        const texto = interaction.fields.getTextInputValue("texto");
        const color = interaction.fields.getTextInputValue("color") || "#8A2BE2";
        const imagen = interaction.fields.getTextInputValue("imagen");

        const embed = new EmbedBuilder()
            .setTitle(titulo)
            .setDescription(texto)
            .setColor(color);

        if (imagen) {
            embed.setImage(imagen);
        }

        await interaction.channel.send({
            embeds: [embed]
        });

        return interaction.editReply({
            content: "✅ Embed enviado correctamente."
        });

    }

    if (interaction.customId === "modal_añadir_usuario_ticket") {
        const guildConfig = config[interaction.guild.id];

        if (!isTicketStaff(interaction.member, guildConfig)) {
            return interaction.reply({
                content: "Solo el staff puede añadir usuarios al ticket.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        if (!isTicketChannel(interaction.channel)) {
            return interaction.reply({
                content: "Este comando solo funciona dentro de un ticket.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const rawValue = interaction.fields.getTextInputValue("usuario_id").trim();
        const userId = rawValue.replace(/[<@!>]/g, "");

        const member = await interaction.guild.members.fetch(userId).catch(() => null);

        if (!member) {
            return interaction.editReply({
                content: "No encontré a ese usuario en el servidor."
            });
        }

        await interaction.channel.permissionOverwrites.edit(member.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
        });

        await interaction.channel.send(`${member} fue añadido al ticket por ${interaction.user}.`);

        return interaction.editReply({
            content: `Usuario añadido: ${member}`
        });
    }

}

    if (interaction.isStringSelectMenu() && interaction.customId === "crear_ticket") {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            if (config[interaction.guild.id]?.tickets?.enabled === false) {
                await interaction.editReply(
                    "🔴 Los tickets están desactivados por la administración."
                );
                return;
            }

            const categoria = interaction.values[0];
            const nombresCategorias = {
                reportar: "Reportar Jugador",
                dudas: "Dudas",
                bugs: "Reportar Bugs",
                apelacion: "Apelacion",
                alianza: "Alianza"
            };

            const configuracion = config[interaction.guild.id];
            if (!configuracion?.ticketCategory) {
                await interaction.editReply(
                    "Primero un administrador debe usar /setticket."
                );
                return;
            }

            const canalExistente = interaction.guild.channels.cache.find(canal => {
                const ticketInfo = getTicketInfo(canal.topic);
                return ticketInfo?.ownerId === interaction.user.id;
            });

            if (canalExistente) {
                await interaction.editReply(
                    `Ya tienes un ticket abierto: ${canalExistente}`
                );
                return;
            }

            const ticket = await interaction.guild.channels.create({
                name: `ticket-${categoria}-${sanitizeChannelName(interaction.user.username)}`.slice(0, 100),
                type: ChannelType.GuildText,
                parent: configuracion.ticketCategory,
                topic: buildTicketTopic(interaction.user.id, categoria),
                permissionOverwrites: buildTicketPermissionOverwrites(
                    interaction.guild,
                    interaction.user.id,
                    interaction.client.user.id,
                    configuracion.staffRole
                )
            });

            const embed = new EmbedBuilder()
                .setColor("#8A2BE2")
                .setTitle("Ticket creado correctamente")
                .setDescription(
                    `Usuario: ${interaction.user}\n` +
                    `Categoria: ${nombresCategorias[categoria]}\n` +
                    `Estado: Sin reclamar\n\n` +
                    "Describe tu problema con el mayor detalle posible."
                )
                .setFooter({ text: "DRAGONS | Sistema de Tickets" })
                .setTimestamp();

            await ticket.send({
                content: `${interaction.user}`,
                embeds: [embed],
                components: buildTicketActionRows()
            });

            await interaction.editReply(`Ticket creado: ${ticket}`);
        } catch (error) {
            console.error("Error creando ticket:", error);

            const mensajeError = error.code === 50013
                ? "No tengo permisos para crear canales. Necesito **Gestionar canales** y acceso a la categoría de tickets."
                : "No pude crear el ticket. Revisa la consola del bot.";

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(mensajeError);
            } else {
                await interaction.reply({
                    content: mensajeError,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        return;
    }

if (interaction.isButton()) {

if (interaction.customId === "reclamar_ticket") {
    try {
        const guildConfig = config[interaction.guild.id];

        if (!isTicketChannel(interaction.channel)) {
            return interaction.reply({
                content: "Este botón solo funciona dentro de un ticket.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        if (!isTicketStaff(interaction.member, guildConfig)) {
            return interaction.reply({
                content: "Solo el staff puede reclamar tickets.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        const ticketInfo = getTicketInfo(interaction.channel.topic);

        if (!ticketInfo?.ownerId) {
            return interaction.reply({
                content: "No pude leer la información de este ticket.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        if (ticketInfo.claimedBy && ticketInfo.claimedBy !== interaction.user.id) {
            const claimer = await interaction.client.users.fetch(ticketInfo.claimedBy).catch(() => null);
            return interaction.reply({
                content: claimer
                    ? `Este ticket ya fue reclamado por ${claimer}.`
                    : "Este ticket ya fue reclamado por otro miembro del staff.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        if (ticketInfo.claimedBy === interaction.user.id) {
            return interaction.reply({
                content: "Ya reclamaste este ticket.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        await interaction.channel.setTopic(
            buildTicketTopic(ticketInfo.ownerId, ticketInfo.category, interaction.user.id)
        );

        const embedActual = interaction.message.embeds[0];
        const embedActualizado = embedActual
            ? EmbedBuilder.from(embedActual).setDescription(
                (embedActual.description || "").replace(
                    "Estado: Sin reclamar",
                    `Estado: Reclamado por ${interaction.user}`
                )
            )
            : new EmbedBuilder()
                .setColor("#8A2BE2")
                .setTitle("Ticket reclamado")
                .setDescription(`${interaction.user} se encargará de este ticket.`);

        await interaction.message.edit({
            embeds: [embedActualizado],
            components: buildTicketActionRows(interaction.user.id)
        });

        await interaction.channel.send(`${interaction.user} reclamó este ticket.`);

        return interaction.editReply("Ticket reclamado correctamente.").catch(() => {});
    } catch (error) {
        if (error?.code === 40060 || error?.code === 10062) {
            return;
        }

        console.error("Error al reclamar ticket:", error);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply("No pude reclamar el ticket.").catch(() => {});
        }
        return interaction.reply({
            content: "No pude reclamar el ticket.",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
}

if (interaction.customId === "añadir_usuario_ticket") {
    const guildConfig = config[interaction.guild.id];

    if (!isTicketChannel(interaction.channel)) {
        return interaction.reply({
            content: "Este botón solo funciona dentro de un ticket.",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }

    if (!isTicketStaff(interaction.member, guildConfig)) {
        return interaction.reply({
            content: "Solo el staff puede añadir usuarios al ticket.",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }

    const modal = new ModalBuilder()
        .setCustomId("modal_añadir_usuario_ticket")
        .setTitle("Añadir usuario al ticket");

    const input = new TextInputBuilder()
        .setCustomId("usuario_id")
        .setLabel("ID o mención del usuario")
        .setPlaceholder("Ej: 123456789012345678 o @usuario")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal).catch(() => {});
}

if (interaction.customId === "cerrar_ticket") {
    try {
        const guildConfig = config[interaction.guild.id];

        if (!isTicketChannel(interaction.channel)) {
            return interaction.reply({
                content: "Este botón solo funciona dentro de un ticket.",
                flags: MessageFlags.Ephemeral
            });
        }

        const ticketInfo = getTicketInfo(interaction.channel.topic);
        const puedeCerrar = isTicketStaff(interaction.member, guildConfig) ||
            ticketInfo?.ownerId === interaction.user.id;

        if (!puedeCerrar) {
            return interaction.reply({
                content: "No tienes permiso para cerrar este ticket.",
                flags: MessageFlags.Ephemeral
            });
        }

        return await interaction.reply({
            content: "🔒 **¿Seguro que quieres cerrar este ticket?**\n\nSe generará un transcript y el canal se eliminará.",
            components: [buildCloseConfirmationRow()],
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        if (error?.code === 40060 || error?.code === 10062) {
            return;
        }

        console.error("Error al responder al botón cerrar_ticket:", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "No pude cerrar el ticket.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }

    return;
}

if (interaction.customId === "confirmar_cierre_ticket") {
    try {
        const guildConfig = config[interaction.guild.id];

        if (!isTicketChannel(interaction.channel)) {
            return interaction.update({
                content: "Este canal ya no es un ticket o ya fue cerrado.",
                components: []
            }).catch(() => {});
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        await interaction.editReply("⏳ Generando transcript y cerrando el ticket...");

        const channel = interaction.channel;
        const closedBy = interaction.user;
        const ticketInfo = getTicketInfo(channel.topic);

        let messageCount = 0;
        try {
            if (ticketInfo) {
                const result = await sendTicketTranscript(channel, ticketInfo, closedBy, guildConfig);
                messageCount = result?.messageCount || 0;
            }
        } catch (error) {
            console.error("Error al generar el transcript:", error);
        }

        try {
            const owner = ticketInfo?.ownerId
                ? await interaction.client.users.fetch(ticketInfo.ownerId).catch(() => null)
                : null;
            const claimer = ticketInfo?.claimedBy
                ? await interaction.client.users.fetch(ticketInfo.claimedBy).catch(() => null)
                : null;

            await logSystem.logAction(channel.guild, config, {
                category: "tickets",
                event: "ticketDelete",
                title: "🎫 Ticket cerrado",
                description: `El ticket **${channel.name}** fue cerrado y eliminado.`,
                fields: [
                    { name: "📌 Canal", value: `#${channel.name}`, inline: true },
                    { name: "👤 Propietario", value: owner ? `${owner}` : (ticketInfo?.ownerId ? `<@${ticketInfo.ownerId}>` : "Desconocido"), inline: true },
                    { name: "🔒 Cerrado por", value: `${closedBy}`, inline: true },
                    { name: "🙋 Reclamado por", value: claimer ? `${claimer}` : "Nadie", inline: true },
                    ...(messageCount ? [{ name: "💬 Mensajes", value: `${messageCount}`, inline: true }] : [])
                ]
            });
        } catch (error) {
            console.error("Error al registrar el cierre en los logs:", error);
        }

        await interaction.editReply("✅ Ticket cerrado correctamente. El canal se eliminará en unos segundos.");

        logSystem.registerAction(`ticketdelete:${channel.guild.id}:${channel.id}`);

        setTimeout(async () => {
            try {
                await channel.delete();
            } catch (error) {
                console.error("Error al eliminar el ticket:", error);
            }
        }, 5000);
    } catch (error) {
        if (error?.code === 40060 || error?.code === 10062) {
            return;
        }

        console.error("Error confirmando el cierre del ticket:", error);

        if (interaction.deferred) {
            await interaction.editReply("No pude cerrar el ticket.").catch(() => {});
        } else if (!interaction.replied) {
            await interaction.reply({
                content: "No pude cerrar el ticket.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }

    return;
}

if (interaction.customId === "cancelar_cierre_ticket") {
    try {
        await interaction.update({
            content: "❌ Cierre cancelado. El ticket sigue abierto.",
            components: []
        });
    } catch (error) {
        await interaction.reply({
            content: "❌ Cierre cancelado.",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }

    return;
}

}

// Si llegamos aqui, ninguna sistema/manejador reclamo esta interaccion
if (!interaction.replied && !interaction.deferred) {
    console.warn(`[INTERACTION:UNHANDLED] ⚠️ NO RECLAMADA type=${interaction.type} customId=${interaction.customId || "null"} cmd=${interaction.commandName || "null"} user=${interaction.user?.tag || "?"} ts=${new Date().toISOString()}`);
}

    } catch (error) {
        console.error("[Bot] Error global en interactionCreate:", error.message, error.stack || "");
        try {
            if (!interaction.replied && !interaction.deferred && (interaction.isButton() || interaction.isCommand() || interaction.isStringSelectMenu() || interaction.isModalSubmit())) {
                await interaction.reply({ content: "❌ Ocurrió un error inesperado.", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        } catch {}
    }
}); // cierra client.on("interactionCreate")

// ===== PROTECCIÓN CONTRA CRASHES =====
client.on("error", error => {
    console.error("[Bot] Error del cliente:", error);
});

process.on("unhandledRejection", reason => {
    console.error("[Bot] Promesa rechazada sin manejar:", reason);
});

process.on("uncaughtException", error => {
    console.error("[Bot] Excepción no capturada:", error);
});

client.login(process.env.TOKEN);