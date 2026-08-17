const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnectionStatus,
    entersState
} = require("@discordjs/voice");
const { Readable } = require("stream");
const { MessageFlags, PermissionsBitField } = require("discord.js");
const ffmpegPath = require("ffmpeg-static");

if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;

const MAX_TEXT_LENGTH = 180;
const LEAVE_DELAY_MS = 15000;

const voiceState = new Map();
const pendingReady = new Map();
let ttsActivityHook = null;

function setTTSActivityHook(fn) {
    ttsActivityHook = fn;
}

function notifyActivity(guildId, active) {
    try {
        if (ttsActivityHook) ttsActivityHook(guildId, active);
    } catch {}
}

function getGuildConfig(config, guildId) {
    if (!config[guildId]) config[guildId] = {};
    return config[guildId];
}

function getTTSConfig(config, guildId) {
    const gc = getGuildConfig(config, guildId);
    if (!gc.tts) gc.tts = { enabled: false, voiceChannel: null, textChannel: null };
    return gc.tts;
}

async function synthesize(text) {
    const url =
        "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&ttsspeed=1&q=" +
        encodeURIComponent(text);

    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0",
            Referer: "https://translate.google.com/"
        }
    });

    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    if (!res.headers.get("content-type")?.includes("audio")) {
        throw new Error("La respuesta de TTS no es audio");
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error("TTS respuesta vacía");

    return buf;
}

function sanitize(text) {
    let clean = text
        .replace(/<@!?&?\d+>/g, "")
        .replace(/<a?:[^:]+:\d+>/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/```[^`]*```/g, "")
        .replace(/`/g, "")
        .replace(/\n+/g, ". ")
        .replace(/\s+/g, " ")
        .trim();
    if (!clean) return null;
    if (clean.length > MAX_TEXT_LENGTH) {
        clean = clean.slice(0, MAX_TEXT_LENGTH).trimEnd() + "...";
    }
    return clean;
}

function getState(guildId) {
    if (!voiceState.has(guildId)) {
        voiceState.set(guildId, {
            connection: null,
            player: null,
            queue: [],
            playing: false,
            idleTimer: null,
            channelId: null
        });
    }
    return voiceState.get(guildId);
}

function destroyState(guildId) {
    const state = getState(guildId);
    if (state.idleTimer) clearTimeout(state.idleTimer);
    if (state.connection) {
        try {
            state.connection.removeAllListeners(VoiceConnectionStatus.Disconnected);
            state.connection.removeAllListeners("error");
            state.connection.destroy();
        } catch {}
    }
    pendingReady.delete(guildId);
    voiceState.delete(guildId);
    notifyActivity(guildId, false);
}

function connect(guild, channelId) {
    const state = getState(guild.id);

    if (
        state.connection &&
        state.channelId === channelId &&
        state.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
        return state;
    }

    if (state.connection) {
        try {
            state.connection.destroy();
        } catch {}
    }

    const connection = joinVoiceChannel({
        channelId,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });

    const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play }
    });
    connection.subscribe(player);

    state.connection = connection;
    state.player = player;
    state.channelId = channelId;
    state.playing = false;

    notifyActivity(guild.id, true);

    player.on(AudioPlayerStatus.Idle, () => {
        state.playing = false;
        processQueue(guild.id);
    });

    player.on("error", error => {
        console.error("[TTS] Error de reproducción:", error.message);
        state.playing = false;
        processQueue(guild.id);
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
        if (state.queue.length === 0 && !state.playing) {
            destroyState(guild.id);
        }
    });

    connection.on("error", error => {
        console.error("[TTS] VoiceConnection error:", error.message);
        if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
            destroyState(guild.id);
        }
    });

    return state;
}

function processQueue(guildId) {
    const state = getState(guildId);
    if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
        return;
    }
    if (state.playing) return;

    const text = state.queue.shift();
    if (!text) {
        scheduleLeave(guildId);
        return;
    }

    state.playing = true;

    (async () => {
        try {
            const buf = await synthesize(text);
            if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
                state.playing = false;
                return;
            }
            const resource = createAudioResource(Readable.from(buf), {
                inputType: StreamType.Arbitrary
            });
            state.player.play(resource);
        } catch (error) {
            console.error("[TTS] Error al generar audio:", error.message);
            state.playing = false;
            setTimeout(() => processQueue(guildId), 250);
        }
    })();
}

function enqueue(guild, text) {
    const state = getState(guild.id);
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = null;
    state.queue.push(text);
    processQueue(guild.id);
}

function scheduleLeave(guildId) {
    const state = getState(guildId);
    if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) return;
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
        const s = getState(guildId);
        if (s.queue.length === 0 && !s.playing) {
            destroyState(guildId);
        }
    }, LEAVE_DELAY_MS);
}

function checkVoicePermissions(client, channel) {
    if (!channel || !channel.isVoiceBased()) {
        return ["El canal de voz no existe o no es válido"];
    }
    const me = channel.guild.members.me || client.user;
    const perms = channel.permissionsFor(me);
    const required = {
        [PermissionsBitField.Flags.ViewChannel]: "Ver canal",
        [PermissionsBitField.Flags.Connect]: "Conectar",
        [PermissionsBitField.Flags.Speak]: "Hablar"
    };
    return Object.entries(required)
        .filter(([flag]) => !perms.has(flag))
        .map(([, name]) => name);
}

async function speakText(client, guild, channelId, text) {
    const voiceChannel = guild.channels.cache.get(channelId);
    if (!voiceChannel || !voiceChannel.isVoiceBased()) {
        return { ok: false, reason: "Canal de voz inexistente." };
    }

    const missing = checkVoicePermissions(client, voiceChannel);
    if (missing.length) {
        return { ok: false, reason: `Faltan permisos: ${missing.join(", ")}.` };
    }

    const clean = sanitize(text);
    if (!clean) {
        return { ok: false, reason: "El texto no es válido para TTS." };
    }

    try {
        const state = connect(guild, voiceChannel.id);
        const conn = state.connection;
        if (conn && conn.state.status !== VoiceConnectionStatus.Ready) {
            const key = `${guild.id}:${conn.state.status}`;
            let promise = pendingReady.get(guild.id);
            if (!promise || promise._settled) {
                promise = entersState(conn, VoiceConnectionStatus.Ready, 10000).catch(() => null);
                promise._settled = false;
                promise.then(() => { promise._settled = true; pendingReady.delete(guild.id); }, () => { promise._settled = true; pendingReady.delete(guild.id); });
                pendingReady.set(guild.id, promise);
            }
            const result = await promise;
            if (!result) {
                return { ok: false, reason: "No se pudo conectar a Discord Voice (posible error de DNS o red)." };
            }
        }
    } catch (error) {
        return { ok: false, reason: `No se pudo conectar: ${error.message}` };
    }

    enqueue(guild, clean);
    return { ok: true, reason: null };
}

async function handleTTSMessage(message, config) {
    if (!message.guild || message.author.bot) return;

    const tts = getTTSConfig(config, message.guild.id);
    if (!tts.enabled) return;
    if (!tts.textChannel || message.channel.id !== tts.textChannel) return;
    if (!tts.voiceChannel) return;

    const clean = sanitize(message.content);
    if (!clean) return;

    const voiceChannel = message.guild.channels.cache.get(tts.voiceChannel);
    if (!voiceChannel || !voiceChannel.isVoiceBased()) return;

    const missing = checkVoicePermissions(message.client, voiceChannel);
    if (missing.length) return;

    try {
        speakText(message.client, message.guild, tts.voiceChannel, clean);
    } catch (error) {
        console.error("[TTS] Error en modo automático:", error.message);
    }
}

async function handleTTSCommand(interaction, config, saveConfig) {
    const guild = interaction.guild;
    const gc = getGuildConfig(config, guild.id);
    const tts = getTTSConfig(config, guild.id);

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const roles = gc.panel?.roles || [];
            if (!roles.some(rid => interaction.member.roles.cache.has(rid))) {
                return interaction.reply({
                    content: "❌ No tienes permiso para usar este comando.",
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }

    const texto = interaction.options.getString("texto");

    if (!texto) {
        const voice = tts.voiceChannel
            ? `<#${tts.voiceChannel}>`
            : "⚠️ No configurado";
        const text = tts.textChannel
            ? `<#${tts.textChannel}>`
            : "⚠️ No configurado";
        const connected = getState(guild.id).connection ? "🟢 Sí" : "⚪ No";

        return interaction.reply({
            content:
                `🔊 **SISTEMA TTS**\n\n` +
                `🎙️ Canal de voz (modo auto): ${voice}\n` +
                `💬 Canal de texto (modo auto): ${text}\n` +
                `🔗 Conectado ahora: ${connected}\n\n` +
                `**Uso manual:** entra a un canal de voz y usa \`/tts texto: <texto>\` para que el bot entre y hable.\n` +
                `**Modo auto:** actívalo en \`/panel\` → 🔊 TTS (lee en voz alta los mensajes del canal de texto).`,
            flags: MessageFlags.Ephemeral
        });
    }

    const voiceChannel = interaction.member.voice?.channel;

    if (!voiceChannel) {
        return interaction.reply({
            content: "❌ No estás en un canal de voz. Entra primero a un canal de voz y vuelve a usar `/tts texto: <texto>`.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!voiceChannel.isVoiceBased()) {
        return interaction.reply({
            content: "❌ El canal donde estás no es un canal de voz.",
            flags: MessageFlags.Ephemeral
        });
    }

    const missing = checkVoicePermissions(interaction.client, voiceChannel);
    if (missing.length) {
        return interaction.reply({
            content: `❌ El bot no puede unirse a ${voiceChannel}. Le faltan los permisos de: **${missing.join(", ")}**.`,
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const clean = sanitize(texto);
    if (!clean) {
        return interaction.editReply({
            content: "❌ No se pudo procesar ese texto para TTS."
        });
    }

    const result = await speakText(interaction.client, guild, voiceChannel.id, clean);
    if (!result.ok) {
        return interaction.editReply({
            content: `❌ ${result.reason}`
        });
    }

    return interaction.editReply({
        content: `🔊 Reproduciendo en ${voiceChannel}…`
    });
}

async function handleTTSInteraction(interaction, config, saveConfig) {
    if (interaction.isCommand() && interaction.commandName === "tts") {
        await handleTTSCommand(interaction, config, saveConfig);
        return true;
    }
    return false;
}

module.exports = {
    handleTTSMessage,
    handleTTSInteraction,
    speakText,
    sanitize,
    synthesize,
    checkVoicePermissions,
    connect,
    setTTSActivityHook
};
