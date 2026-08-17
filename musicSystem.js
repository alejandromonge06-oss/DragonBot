const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionsBitField
} = require("discord.js");
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnectionStatus,
    demuxProbe,
    getVoiceConnection,
    entersState
} = require("@discordjs/voice");
const YTDlpWrap = require("yt-dlp-wrap").default;
const ttsSystem = require("./ttsSystem");

const BIN_PATH = path.join(__dirname, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const YTDLP = new YTDlpWrap(BIN_PATH);

const MUSIC_COLOR = "#A52BE2";
const FALLBACK_CLIENTS = ["mediaconnect", "web_embedded", "default"];
const STREAM_TIMEOUT_MS = 10000;
const RESOLVE_TIMEOUT_MS = 20000;
const DEFAULT_LEAVE_MS = 60000;

const sessions = new Map();
const pendingReady = new Map();
let activeTTSGuilds = new Set();

// ==================== SAFE INTERACTION HELPERS ====================

async function safeReply(interaction, payload) {
    try {
        if (interaction.replied || interaction.deferred) {
            return await interaction.followUp(payload).catch(() => null);
        }
        return await interaction.reply(payload).catch(() => null);
    } catch {
        return null;
    }
}

async function safeEditReply(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(payload).catch(() => null);
        }
        return await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => null);
    } catch {
        return null;
    }
}

async function safeDeferReply(interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(() => {});
        }
    } catch {
        // already deferred or error
    }
}

async function safeUpdate(interaction, payload) {
    try {
        if (interaction.deferred) {
            return await interaction.editReply(payload).catch(() => null);
        }
        return await interaction.update(payload).catch(async () => {
            try {
                return await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => null);
            } catch {
                return null;
            }
        });
    } catch {
        return null;
    }
}

// ==================== CONFIG HELPERS ====================

function getGuildConfig(config, guildId) {
    if (!config[guildId]) config[guildId] = {};
    return config[guildId];
}

function ensureMusicConfig(gc) {
    if (!gc.music) {
        gc.music = {
            enabled: true,
            maxVolume: 100,
            autoLeaveMs: DEFAULT_LEAVE_MS,
            controlMode: "all",
            roles: [],
            textChannel: null,
            voiceChannel: null
        };
    }
    const m = gc.music;
    if (m.maxVolume === undefined) m.maxVolume = 100;
    if (m.autoLeaveMs === undefined) m.autoLeaveMs = DEFAULT_LEAVE_MS;
    if (!m.controlMode) m.controlMode = "all";
    if (!Array.isArray(m.roles)) m.roles = [];
    if (m.enabled === undefined) m.enabled = true;
    return gc;
}

// ==================== SESSION MANAGEMENT ====================

function getSession(guildId) {
    if (!sessions.has(guildId)) {
        sessions.set(guildId, {
            connection: null,
            player: null,
            queue: [],
            current: null,
            volume: 100,
            loopMode: "off",
            pausedByUser: false,
            pausedForTTS: false,
            channelId: null,
            lastChannelId: null,
            leaveTimer: null,
            panelMessage: null,
            autoLeaveMs: DEFAULT_LEAVE_MS,
            stopped: true
        });
    }
    return sessions.get(guildId);
}

function destroySession(guildId) {
    const s = sessions.get(guildId);
    if (!s) return;
    if (s.leaveTimer) clearTimeout(s.leaveTimer);
    if (s.connection) {
        try {
            s.connection.removeAllListeners(VoiceConnectionStatus.Disconnected);
            s.connection.removeAllListeners("error");
            s.connection.destroy();
        } catch {}
    }
    if (s.player) {
        try { s.player.stop(); } catch {}
    }
    pendingReady.delete(guildId);
    sessions.delete(guildId);
}

function clearLeaveTimer(s) {
    if (s.leaveTimer) {
        clearTimeout(s.leaveTimer);
        s.leaveTimer = null;
    }
}

function scheduleLeave(s, guildId, ms) {
    clearLeaveTimer(s);
    s.leaveTimer = setTimeout(() => {
        const st = sessions.get(guildId);
        if (st && st.queue.length === 0 && !st.current && !st.pausedForTTS) {
            destroySession(guildId);
        }
    }, ms);
}

// ==================== DISPLAY HELPERS ====================

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "∞";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function progressBar(current, total, length = 14) {
    if (!Number.isFinite(total) || total <= 0) return "`[🔇 sin progreso]`";
    const pct = Math.max(0, Math.min(1, (current || 0) / total));
    const filled = Math.round(pct * length);
    const bar = "━".repeat(filled) + "🔘" + "─".repeat(Math.max(0, length - filled - 1));
    return `\`${bar}\` ${formatTime(current)} / ${formatTime(total)}`;
}

// ==================== PERMISSIONS ====================

function canControl(member, gc, session) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const m = gc.music || {};
    const mode = m.controlMode || "all";
    if (mode === "all") return true;
    if (mode === "sameChannel") {
        return Boolean(session?.channelId && member.voice?.channelId === session.channelId);
    }
    if (mode === "roles") {
        const roles = m.roles || [];
        return roles.some(rid => member.roles.cache.has(rid));
    }
    return true;
}

function checkVoicePermissions(client, channel) {
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

// ==================== TRACK RESOLUTION ====================

async function resolveTrack(input) {
    const isUrl = /^https?:\/\//.test(input);

    if (isUrl) {
        const out = await Promise.race([
            YTDLP.execPromise([input, "-J", "--no-warnings", "--no-playlist", "--flat-playlist"]),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Tiempo de búsqueda agotado")), RESOLVE_TIMEOUT_MS))
        ]);
        const o = JSON.parse(out);
        const entry = o.entries && o.entries.length ? o.entries[0] : o;
        const id = entry.id;
        const url = entry.entries && entry.entries.length > 1
            ? `https://www.youtube.com/watch?v=${entry.entries[0].id}`
            : input;
        return {
            url,
            id,
            title: entry.title || "Desconocido",
            duration: Number(entry.duration) || 0,
            channelName: entry.channel || entry.uploader || "—",
            thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
        };
    }

    const out = await Promise.race([
        YTDLP.execPromise([
            `ytsearch1:${input}`,
            "--no-playlist",
            "--no-warnings",
            "--print", "%(id)s\t%(title)s\t%(duration_string)s\t%(channel)s",
            "--flat-playlist"
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Tiempo de búsqueda agotado")), RESOLVE_TIMEOUT_MS))
    ]);
    const lines = out.trim().split(/\r?\n/).filter(Boolean);
    const last = lines[lines.length - 1];
    if (!last) throw new Error("No se encontró ninguna canción.");
    const [id, title, durText, channelName] = last.split("\t");
    if (!id) throw new Error("No se encontró ninguna canción.");

    let duration = 0;
    if (durText) {
        const seg = durText.split(":").map(Number);
        if (seg.length === 3) duration = seg[0] * 3600 + seg[1] * 60 + seg[2];
        else if (seg.length === 2) duration = seg[0] * 60 + seg[1];
        else if (seg.length === 1) duration = seg[0];
    }

    return {
        url: `https://www.youtube.com/watch?v=${id}`,
        id,
        title: title || "Desconocido",
        duration,
        channelName: channelName || "—",
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    };
}

// ==================== AUDIO STREAMING ====================

async function streamWithFallback(url) {
    let lastError = null;
    for (const client of FALLBACK_CLIENTS) {
        console.log(`[DRAGONS MUSIC] Intentando stream con client: ${client}`);
        try {
            const stream = await spawnStream(url, client);
            if (stream) {
                console.log(`[DRAGONS MUSIC] ✓ Stream listo con client: ${client}`);
                return stream;
            }
        } catch (e) {
            lastError = e;
            console.log(`[DRAGONS MUSIC] ✗ Fallo en ${client}: ${e.message}`);
        }
    }

    console.log(`[DRAGONS MUSIC] Todos los clients fallaron, intentando descarga a archivo temporal...`);
    try {
        const fileStream = await downloadToFile(url, FALLBACK_CLIENTS[0]);
        if (fileStream) {
            console.log(`[DRAGONS MUSIC] ✓ Archivo temporal listo, reproduciendo...`);
            return fileStream;
        }
    } catch (e) {
        lastError = e;
        console.log(`[DRAGONS MUSIC] ✗ Descarga a archivo falló: ${e.message}`);
    }

    throw lastError || new Error("No se pudo obtener el audio de YouTube (posible bloqueo temporal).");
}

function spawnStream(url, client) {
    return new Promise((resolve, reject) => {
        const args = [
            url,
            "-f", "bestaudio[acodec=opus]/bestaudio/best",
            "-o", "-",
            "--no-playlist",
            "--no-warnings",
            "--force-ipv4",
            "--js-runtimes", "nodejs",
            "--retries", "3",
            "--fragment-retries", "3",
            "--extractor-args", `youtube:player_client=${client}`
        ];

        const child = spawn(BIN_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });
        let settled = false;

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                console.log(`[DRAGONS MUSIC] Timeout en client ${client}`);
                try { child.kill("SIGTERM"); } catch {}
                try { child.stdout.destroy(); } catch {}
                resolve(null);
            }
        }, STREAM_TIMEOUT_MS);

        child.on("error", (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
        });

        child.on("close", (code) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                if (code === 0) {
                    resolve(null);
                } else {
                    reject(new Error(`yt-dlp exit code ${code}`));
                }
            }
        });

        let dataReceived = false;
        child.stdout.on("data", (chunk) => {
            if (!dataReceived) {
                dataReceived = true;
                console.log(`[DRAGONS MUSIC] ✓ Datos recibidos de ${client} (${chunk.length} bytes)`);
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    resolve(child.stdout);
                }
            }
        });

        child.stdout.on("error", (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
        });

        child.stdout.on("close", () => {
            try { child.kill("SIGTERM"); } catch {}
        });

        child.stderr.on("data", (chunk) => {
            const msg = chunk.toString();
            if (msg.includes("ERROR")) {
                console.log(`[DRAGONS MUSIC] yt-dlp stderr (${client}): ${msg.trim()}`);
            }
        });
    });
}

function downloadToFile(url, client) {
    const tmpFile = path.join(os.tmpdir(), `dragonbot-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.webm`);
    const args = [
        url,
        "-f", "bestaudio[acodec=opus]/bestaudio/best",
        "-o", tmpFile,
        "--no-playlist",
        "--no-warnings",
        "--force-ipv4",
        "--js-runtimes", "nodejs",
        "--retries", "3",
        "--fragment-retries", "3",
        "--extractor-args", `youtube:player_client=${client}`
    ];

    return new Promise((resolve, reject) => {
        const child = spawn(BIN_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                try { child.kill("SIGTERM"); } catch {}
                try { fs.unlinkSync(tmpFile); } catch {}
                reject(new Error("Timeout descargando archivo"));
            }
        }, 30000);

        child.on("error", (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                try { fs.unlinkSync(tmpFile); } catch {}
                reject(err);
            }
        });

        child.on("close", (code) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                if (code === 0 && fs.existsSync(tmpFile)) {
                    const stream = fs.createReadStream(tmpFile);
                    stream.on("close", () => { try { fs.unlinkSync(tmpFile); } catch {} });
                    stream.on("error", () => { try { fs.unlinkSync(tmpFile); } catch {} });
                    resolve(stream);
                } else {
                    try { fs.unlinkSync(tmpFile); } catch {}
                    reject(new Error(`yt-dlp exit code ${code}`));
                }
            }
        });

        child.stderr.on("data", (chunk) => {
            const msg = chunk.toString();
            if (msg.includes("ERROR")) {
                console.log(`[DRAGONS MUSIC] yt-dlp file stderr: ${msg.trim()}`);
            }
        });
    });
}

async function createResource(track) {
    console.log(`[DRAGONS MUSIC] Creando recurso para: ${track.title}`);
    const stream = await streamWithFallback(track.url);
    console.log(`[DRAGONS MUSIC] ✓ Stream obtenido, haciendo demuxProbe...`);
    const probe = await demuxProbe(stream, 8000).catch((e) => { console.log(`[DRAGONS MUSIC] ✗ demuxProbe falló: ${e.message}`); return null; });
    if (!probe || !probe.stream) {
        console.log(`[DRAGONS MUSIC] ✗ No se pudo procesar el stream de audio`);
        try { stream.destroy(); } catch {}
        throw new Error("No se pudo procesar el audio.");
    }
    console.log(`[DRAGONS MUSIC] ✓ AudioResource creado (tipo: ${probe.streamType})`);
    return createAudioResource(probe.stream, {
        inputType: probe.streamType || StreamType.Arbitrary,
        inlineVolume: true,
        metadata: track
    });
}

// ==================== PLAYBACK ENGINE ====================

async function playTrack(guild, s, track) {
    console.log(`[DRAGONS MUSIC] playTrack: ${track.title}`);
    clearLeaveTimer(s);

    let resource;
    try {
        resource = await createResource(track);
    } catch (err) {
        console.error(`[DRAGONS MUSIC] ✗ Error creando recurso: ${err.message}`);
        s.current = null;
        s.stopped = false;
        playNext(guild, s);
        return;
    }

    if (!s.player || !s.connection || s.connection.state.status === VoiceConnectionStatus.Destroyed) {
        console.log(`[DRAGONS MUSIC] ✗ Player o connection destruido, abortando`);
        try { resource.destroy?.(); } catch {}
        return;
    }

    s.current = track;
    s.stopped = false;
    s.pausedByUser = false;
    try { resource.volume.setVolume((s.volume || 100) / 100); } catch {}
    s.player.play(resource);
    console.log(`[DRAGONS MUSIC] ✓ player.play() llamado, estado: ${s.player.state.status}`);
    console.log(`[DRAGONS MUSIC] ✓ Connection status: ${s.connection.state.status}`);
    console.log(`[DRAGONS MUSIC] ✓ Subscription: ${s.connection.state.status === VoiceConnectionStatus.Ready ? 'activa' : 'pendiente'}`);
    refreshPanel(guild, s).catch(() => {});
}

function playNext(guild, s) {
    if (s.stopped) return;
    if (!s.connection || s.connection.state.status === VoiceConnectionStatus.Destroyed) return;

    const loopSong = s.loopMode === "song" && s.current;
    let next;
    if (loopSong) {
        next = s.current;
    } else {
        if (s.loopMode === "queue" && s.current) {
            s.queue.push(s.current);
        }
        next = s.queue.shift();
    }

    if (!next) {
        s.current = null;
        s.stopped = true;
        scheduleLeave(s, guild.id, s.autoLeaveMs || DEFAULT_LEAVE_MS);
        refreshPanel(guild, s).catch(() => {});
        return;
    }

    s.current = next;
    playTrack(guild, s, next).catch(err => {
        console.error("[MÚSICA] Error al reproducir:", err.message);
        s.current = null;
        s.stopped = false;
        playNext(guild, s);
    });
}

// ==================== VOICE CONNECTION ====================

async function connect(guild, channelId) {
    const existing = getVoiceConnection(guild.id);
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
        if (existing.state.status === VoiceConnectionStatus.Disconnected ||
            existing.state.channelId !== channelId) {
            existing.rejoin({ channelId, selfDeaf: false, selfMute: false });
        }
        return existing;
    }

    const connection = joinVoiceChannel({
        channelId,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });
    return connection;
}

async function startSession(interaction, config) {
    const guild = interaction.guild;
    const member = interaction.member;

    if (!member.voice?.channel) {
        return { ok: false, reason: "❌ Entra a un canal de voz primero." };
    }
    const vc = member.voice.channel;
    if (!vc.isVoiceBased()) {
        return { ok: false, reason: "❌ El canal donde estás no es un canal de voz." };
    }

    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    const m = gc.music;
    if (m.voiceChannel && vc.id !== m.voiceChannel) {
        return { ok: false, reason: `❌ La música solo puede reproducirse en <#${m.voiceChannel}>.` };
    }

    const missing = checkVoicePermissions(interaction.client, vc);
    if (missing.length) {
        return { ok: false, reason: `❌ El bot no puede unirse a ${vc}. Le faltan: **${missing.join(", ")}**.` };
    }

    if (activeTTSGuilds.has(guild.id)) {
        return { ok: false, reason: "🔊 El TTS está activo en este servidor. Espera a que termine." };
    }

        const s = getSession(guild.id);
        try {
            const connection = await connect(guild, vc.id);
            console.log(`[DRAGONS MUSIC] VoiceConnection creada, esperando READY...`);

            if (connection.state.status !== VoiceConnectionStatus.Ready) {
                let promise = pendingReady.get(guild.id);
                if (!promise || promise._settled) {
                    promise = entersState(connection, VoiceConnectionStatus.Ready, 20_000).catch(() => null);
                    promise._settled = false;
                    promise.then(() => { promise._settled = true; pendingReady.delete(guild.id); }, () => { promise._settled = true; pendingReady.delete(guild.id); });
                    pendingReady.set(guild.id, promise);
                }
                await promise;
            }

            console.log(`[DRAGONS MUSIC] ✓ VoiceConnection status: ${connection.state.status}`);

            if (!s.player) {
                const player = createAudioPlayer({
                    behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
                });
                player.on(AudioPlayerStatus.Idle, () => {
                    console.log(`[DRAGONS MUSIC] Player → Idle (canción terminada o stream cortado)`);
                    const st = sessions.get(guild.id);
                    if (!st || st.stopped) return;
                    if (st.loopMode === "song" && st.current) {
                        playTrack(guild, st, st.current).catch(() => {
                            st.stopped = false;
                            playNext(guild, st);
                        });
                    } else {
                        playNext(guild, st);
                    }
                });
                player.on(AudioPlayerStatus.Paused, () => {
                    console.log(`[DRAGONS MUSIC] Player → Paused`);
                    const st = sessions.get(guild.id);
                    if (st) st.pausedByUser = true;
                });
                player.on(AudioPlayerStatus.Playing, () => {
                    console.log(`[DRAGONS MUSIC] ✓ Player → Playing (audio en cours)`);
                    const st = sessions.get(guild.id);
                    if (st) st.pausedByUser = false;
                });
                player.on(AudioPlayerStatus.Buffering, () => {
                    console.log(`[DRAGONS MUSIC] Player → Buffering...`);
                });
                player.on("error", error => {
                    console.error(`[DRAGONS MUSIC] ✗ Player error: ${error.message}`);
                    const st = sessions.get(guild.id);
                    if (!st) return;
                    st.current = null;
                    st.stopped = false;
                    playNext(guild, st);
                });
                s.player = player;
            }

            const sub = connection.subscribe(s.player);
            console.log(`[DRAGONS MUSIC] ✓ Player suscrito a VoiceConnection: ${Boolean(sub)}`);
            s.connection = connection;
            s.channelId = vc.id;
            s.autoLeaveMs = m.autoLeaveMs || DEFAULT_LEAVE_MS;
            s.stopped = false;
            s.pausedForTTS = false;

            connection.removeAllListeners(VoiceConnectionStatus.Disconnected);
            connection.on(VoiceConnectionStatus.Disconnected, () => {
                console.log(`[DRAGONS MUSIC] VoiceConnection → Disconnected`);
                const st = sessions.get(guild.id);
                if (!st) return;
                if (st.queue.length === 0 && !st.current) {
                    destroySession(guild.id);
                }
            });

            connection.removeAllListeners("error");
            connection.on("error", error => {
                console.error(`[DRAGONS MUSIC] VoiceConnection error: ${error.message}`);
                if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
                    destroySession(guild.id);
                }
            });

            return { ok: true, session: s };
        } catch (error) {
            return { ok: false, reason: `❌ No se pudo conectar: ${error.message}` };
        }
}

// ==================== EMBEDS ====================

function nowPlayingEmbed(guild, s) {
    const embed = new EmbedBuilder()
        .setColor(MUSIC_COLOR)
        .setTitle("🎵 DRAGONS | MUSIC");

    if (!s.current) {
        embed.setDescription(
            "Sin reproducción activa.\n" +
            `Usa \`/play cancion: <nombre o URL>\` para empezar.`
        );
        return embed;
    }

    const t = s.current;
    const pos = s.player?.state?.resource?.playbackDuration || 0;
    const volume = s.volume || 100;
    const loopLabel = s.loopMode === "song" ? "🔂 Canción" : s.loopMode === "queue" ? "🔁 Cola" : "➡️ Desactivado";

    embed
        .setTitle(`🎵 ${t.title}`)
        .setURL(t.url)
        .setThumbnail(t.thumbnail)
        .setDescription(
            `**${s.pausedByUser ? "⏸️ En pausa" : "▶️ Reproduciendo"}**\n` +
            `${progressBar(pos / 1000, t.duration)}\n\n` +
            `👤 Pedida por: <@${t.requestedBy || ""}>` +
            (t.channelName && t.channelName !== "—" ? `\n📺 ${t.channelName}` : "")
        )
        .addFields(
            { name: "📜 En cola", value: `**${s.queue.length}** canción(es)`, inline: true },
            { name: "🔊 Volumen", value: `**${volume}%**`, inline: true },
            { name: "🔁 Loop", value: loopLabel, inline: true }
        )
        .setFooter({ text: `DRAGONS | ${guild.name}` });

    return embed;
}

function buildPanel(guild, s) {
    const connected = s.connection && s.connection.state.status !== VoiceConnectionStatus.Destroyed;
    const playing = s.current && !s.pausedByUser;
    const paused = s.current && s.pausedByUser;

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("mu_pause")
                .setLabel(paused ? "Reanudar" : "Pausar")
                .setEmoji(paused ? "▶️" : "⏸️")
                .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(!s.current),
            new ButtonBuilder()
                .setCustomId("mu_skip")
                .setLabel("Saltar")
                .setEmoji("⏭️")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!s.current && s.queue.length === 0),
            new ButtonBuilder()
                .setCustomId("mu_stop")
                .setLabel("Detener")
                .setEmoji("⏹️")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(!s.current && s.queue.length === 0),
            new ButtonBuilder()
                .setCustomId("mu_loop")
                .setLabel(s.loopMode === "off" ? "Loop" : s.loopMode === "song" ? "Canción" : "Cola")
                .setEmoji(s.loopMode === "off" ? "🔁" : "🔂")
                .setStyle(s.loopMode === "off" ? ButtonStyle.Secondary : ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("mu_shuffle")
                .setLabel("Mezclar")
                .setEmoji("🔀")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(s.queue.length < 2)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("mu_queue")
                .setLabel(`Cola (${s.queue.length})`)
                .setEmoji("📜")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("mu_vol_down")
                .setLabel(`-${10}`)
                .setEmoji("🔉")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("mu_vol_up")
                .setLabel(`+${10}`)
                .setEmoji("🔊")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("mu_disconnect")
                .setLabel("Salir")
                .setEmoji("📴")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(!connected)
        )
    ];
    return { embeds: [nowPlayingEmbed(guild, s)], components: rows };
}

async function refreshPanel(guild, s) {
    if (!s.panelMessage) return;
    try {
        const channel = guild.client.channels.cache.get(s.panelMessage.channelId);
        if (!channel) { s.panelMessage = null; return; }
        const msg = await channel.messages.fetch(s.panelMessage.messageId).catch(() => null);
        if (!msg) { s.panelMessage = null; return; }
        await msg.edit(buildPanel(guild, s));
    } catch {
        s.panelMessage = null;
    }
}

function shuffleQueue(s) {
    const arr = s.queue;
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function queueEmbed(guild, s) {
    const embed = new EmbedBuilder()
        .setColor(MUSIC_COLOR)
        .setTitle("📜 COLA DE REPRODUCCIÓN");

    const lines = [];
    if (s.current) {
        lines.push(`**▶️ Ahora:** ${s.current.title} · \`${formatTime(s.current.duration)}\``);
    }
    if (s.queue.length === 0) {
        if (!s.current) lines.push("La cola está vacía.");
    } else {
        s.queue.slice(0, 10).forEach((t, i) => {
            lines.push(`**${i + 1}.** ${t.title} · \`${formatTime(t.duration)}\``);
        });
        if (s.queue.length > 10) {
            lines.push(`... y **${s.queue.length - 10}** más.`);
        }
    }
    embed.setDescription(lines.join("\n"));
    embed.setFooter({ text: `DRAGONS | ${guild.name} · /remove posicion: <n>` });
    return embed;
}

// ==================== COMMAND HANDLERS ====================

async function handlePlayCommand(interaction, config) {
    const guild = interaction.guild;
    const query = interaction.options.getString("cancion");

    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (gc.music.enabled === false) {
        const admin = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!admin) {
            return safeReply(interaction, {
                content: "❌ El sistema de música está desactivado. Actívalo en `/panel` → 🎵 Música.",
                flags: MessageFlags.Ephemeral
            });
        }
    }

    await safeDeferReply(interaction);

    const started = await startSession(interaction, config);
    if (!started.ok) {
        return safeEditReply(interaction, { content: started.reason });
    }

    let track;
    try {
        track = await resolveTrack(query);
    } catch (error) {
        return safeEditReply(interaction, {
            content: `❌ No se encontró: ${error.message}`
        });
    }
    track.requestedBy = interaction.user.id;

    const s = getSession(guild.id);
    const wasEmpty = s.queue.length === 0 && !s.current;

    if (wasEmpty) {
        s.current = track;
        s.stopped = false;
        playTrack(guild, s, track).catch(err => {
            console.error("[MÚSICA] Error play:", err.message);
            s.current = null;
            s.stopped = false;
            playNext(guild, s);
        });
    } else {
        s.queue.push(track);
    }

    const panelPayload = buildPanel(guild, s);
    const reply = await interaction.editReply(panelPayload).catch(() => null);
    if (reply) {
        s.panelMessage = { channelId: interaction.channel.id, messageId: reply.id };
    }
}

async function handlePauseCommand(interaction, config) {
    const s = getSession(interaction.guild.id);
    const gc = getGuildConfig(config, interaction.guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    if (!s.player || !s.current) {
        return safeReply(interaction, { content: "❌ No hay nada reproduciéndose.", flags: MessageFlags.Ephemeral });
    }
    if (s.pausedByUser) {
        return safeReply(interaction, { content: "⏸️ Ya está en pausa.", flags: MessageFlags.Ephemeral });
    }
    s.player.pause();
    refreshPanel(interaction.guild, s).catch(() => {});
    return safeReply(interaction, { content: "⏸️ Música en pausa.", flags: MessageFlags.Ephemeral });
}

async function handleResumeCommand(interaction, config) {
    const s = getSession(interaction.guild.id);
    const gc = getGuildConfig(config, interaction.guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    if (!s.player || !s.current) {
        return safeReply(interaction, { content: "❌ No hay nada en pausa.", flags: MessageFlags.Ephemeral });
    }
    if (!s.pausedByUser) {
        return safeReply(interaction, { content: "▶️ Ya está reproduciendo.", flags: MessageFlags.Ephemeral });
    }
    s.player.unpause();
    refreshPanel(interaction.guild, s).catch(() => {});
    return safeReply(interaction, { content: "▶️ Reproduciendo.", flags: MessageFlags.Ephemeral });
}

async function handleSkipCommand(interaction, config) {
    const guild = interaction.guild;
    const s = getSession(guild.id);
    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    if (!s.current && s.queue.length === 0) {
        return safeReply(interaction, { content: "❌ No hay nada que saltar.", flags: MessageFlags.Ephemeral });
    }
    const skipped = s.current;
    if (s.loopMode === "song") s.loopMode = "off";

    if (s.queue.length === 0) {
        s.current = null;
        if (s.player) { try { s.player.stop(); } catch {} }
        scheduleLeave(s, guild.id, s.autoLeaveMs || DEFAULT_LEAVE_MS);
        refreshPanel(guild, s).catch(() => {});
        return safeReply(interaction, { content: skipped ? `⏭️ Saltaste **${skipped.title}**. Cola vacía.` : "⏭️ Cola vacía.", flags: MessageFlags.Ephemeral });
    }

    s.stopped = false;
    if (s.player) { try { s.player.stop(); } catch {} }
    playNext(guild, s);
    return safeReply(interaction, { content: skipped ? `⏭️ Saltaste **${skipped.title}**.` : "⏭️ Siguiente.", flags: MessageFlags.Ephemeral });
}

async function handleStopCommand(interaction, config) {
    const guild = interaction.guild;
    const s = getSession(guild.id);
    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    s.queue = [];
    s.current = null;
    s.stopped = true;
    if (s.player) { try { s.player.stop(); } catch {} }
    scheduleLeave(s, guild.id, s.autoLeaveMs || DEFAULT_LEAVE_MS);
    refreshPanel(guild, s).catch(() => {});
    return safeReply(interaction, { content: "⏹️ Música detenida. Cola vaciada.", flags: MessageFlags.Ephemeral });
}

async function handleQueueCommand(interaction) {
    const s = getSession(interaction.guild.id);
    return safeReply(interaction, { embeds: [queueEmbed(interaction.guild, s)], flags: MessageFlags.Ephemeral });
}

async function handleNowPlayingCommand(interaction) {
    const s = getSession(interaction.guild.id);
    return safeReply(interaction, { embeds: [nowPlayingEmbed(interaction.guild, s)], flags: MessageFlags.Ephemeral });
}

async function handleVolumeCommand(interaction, config) {
    const guild = interaction.guild;
    const s = getSession(guild.id);
    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    const volume = interaction.options.getInteger("nivel");
    const maxVolume = gc.music.maxVolume || 100;

    if (volume === null) {
        return safeReply(interaction, { content: `🔊 Volumen actual: **${s.volume}%** (máximo: **${maxVolume}%**).`, flags: MessageFlags.Ephemeral });
    }
    if (volume < 0 || volume > maxVolume) {
        return safeReply(interaction, { content: `❌ Volumen entre **0** y **${maxVolume}%**.`, flags: MessageFlags.Ephemeral });
    }
    s.volume = volume;
    if (s.player?.state?.resource) {
        try { s.player.state.resource.volume.setVolume(volume / 100); } catch {}
    }
    refreshPanel(guild, s).catch(() => {});
    return safeReply(interaction, { content: `🔊 Volumen: **${volume}%**.`, flags: MessageFlags.Ephemeral });
}

async function handleLoopCommand(interaction, config) {
    const guild = interaction.guild;
    const s = getSession(guild.id);
    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    s.loopMode = s.loopMode === "off" ? "song" : s.loopMode === "song" ? "queue" : "off";
    const label = s.loopMode === "song" ? "🔂 canción actual" : s.loopMode === "queue" ? "🔁 toda la cola" : "➡️ desactivado";
    refreshPanel(guild, s).catch(() => {});
    return safeReply(interaction, { content: `🔁 Loop: **${label}**.`, flags: MessageFlags.Ephemeral });
}

async function handleShuffleCommand(interaction, config) {
    const guild = interaction.guild;
    const s = getSession(guild.id);
    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    if (s.queue.length < 2) {
        return safeReply(interaction, { content: "❌ Necesitas al menos 2 canciones en la cola.", flags: MessageFlags.Ephemeral });
    }
    shuffleQueue(s);
    return safeReply(interaction, { content: `🔀 Cola mezclada: **${s.queue.length}** canciones.`, flags: MessageFlags.Ephemeral });
}

async function handleRemoveCommand(interaction, config) {
    const guild = interaction.guild;
    const s = getSession(guild.id);
    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    const pos = interaction.options.getInteger("posicion");
    if (!Number.isInteger(pos) || pos < 1 || pos > s.queue.length) {
        return safeReply(interaction, { content: `❌ Posición inválida. Cola: **${s.queue.length}** canción(es).`, flags: MessageFlags.Ephemeral });
    }
    const removed = s.queue.splice(pos - 1, 1)[0];
    refreshPanel(guild, s).catch(() => {});
    return safeReply(interaction, { content: `🗑️ Quitada: **${removed?.title || "?"}**.`, flags: MessageFlags.Ephemeral });
}

async function handleClearQueueCommand(interaction, config) {
    const guild = interaction.guild;
    const s = getSession(guild.id);
    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    const count = s.queue.length;
    s.queue = [];
    refreshPanel(guild, s).catch(() => {});
    return safeReply(interaction, { content: count ? `🧹 Cola vaciada (**${count}** canciones).` : "✅ La cola ya estaba vacía.", flags: MessageFlags.Ephemeral });
}

async function handleDisconnectCommand(interaction, config) {
    const guild = interaction.guild;
    const s = getSession(guild.id);
    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (!canControl(interaction.member, gc, s)) {
        return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
    }
    if (!s.connection || s.connection.state.status === VoiceConnectionStatus.Destroyed) {
        return safeReply(interaction, { content: "⚠️ No estoy en ningún canal de voz.", flags: MessageFlags.Ephemeral });
    }
    destroySession(guild.id);
    return safeReply(interaction, { content: "📴 Desconectado. Cola y música limpiadas.", flags: MessageFlags.Ephemeral });
}

// ==================== PANEL HANDLERS ====================

async function handleMusicPanelCommand(interaction, config) {
    const guild = interaction.guild;
    const gc = getGuildConfig(config, guild.id);
    ensureMusicConfig(gc);
    if (gc.music.enabled === false) {
        const admin = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!admin) {
            return safeReply(interaction, { content: "❌ Música desactivada.", flags: MessageFlags.Ephemeral });
        }
    }
    const s = getSession(guild.id);
    const reply = await interaction.reply(buildPanel(guild, s)).catch(() => null);
    if (reply) {
        s.panelMessage = { channelId: interaction.channel.id, messageId: reply.id };
    }
}

async function handlePanelButton(interaction, config) {
    try {
        const guild = interaction.guild;
        const s = getSession(guild.id);
        const gc = getGuildConfig(config, guild.id);
        ensureMusicConfig(gc);
        const id = interaction.customId;

        if (!canControl(interaction.member, gc, s)) {
            return safeReply(interaction, { content: "❌ No tienes permiso.", flags: MessageFlags.Ephemeral });
        }

        const connected = s.connection && s.connection.state.status !== VoiceConnectionStatus.Destroyed;

        switch (id) {

            case "mu_pause": {
                if (!s.current) {
                    return safeUpdate(interaction, buildPanel(guild, s));
                }
                if (s.pausedByUser) {
                    s.player.unpause();
                } else {
                    s.player.pause();
                }
                break;
            }

            case "mu_skip": {
                const skipped = s.current;
                if (s.loopMode === "song") s.loopMode = "off";
                if (!skipped && s.queue.length === 0) {
                    return safeUpdate(interaction, buildPanel(guild, s));
                }
                if (s.queue.length === 0) {
                    s.current = null;
                    if (s.player) { try { s.player.stop(); } catch {} }
                    scheduleLeave(s, guild.id, s.autoLeaveMs || DEFAULT_LEAVE_MS);
                } else {
                    s.stopped = false;
                    if (s.player) { try { s.player.stop(); } catch {} }
                    playNext(guild, s);
                }
                break;
            }

            case "mu_stop": {
                s.queue = [];
                s.current = null;
                s.stopped = true;
                if (s.player) { try { s.player.stop(); } catch {} }
                scheduleLeave(s, guild.id, s.autoLeaveMs || DEFAULT_LEAVE_MS);
                break;
            }

            case "mu_loop": {
                s.loopMode = s.loopMode === "off" ? "song" : s.loopMode === "song" ? "queue" : "off";
                break;
            }

            case "mu_shuffle": {
                if (s.queue.length < 2) {
                    return safeUpdate(interaction, buildPanel(guild, s));
                }
                shuffleQueue(s);
                break;
            }

            case "mu_queue": {
                return safeUpdate(interaction, {
                    embeds: [queueEmbed(guild, s)],
                    components: buildPanel(guild, s).components
                });
            }

            case "mu_vol_down": {
                s.volume = Math.max(0, (s.volume || 100) - 10);
                if (s.player?.state?.resource) {
                    try { s.player.state.resource.volume.setVolume(s.volume / 100); } catch {}
                }
                break;
            }

            case "mu_vol_up": {
                const max = gc.music.maxVolume || 100;
                s.volume = Math.min(max, (s.volume || 100) + 10);
                if (s.player?.state?.resource) {
                    try { s.player.state.resource.volume.setVolume(s.volume / 100); } catch {}
                }
                break;
            }

            case "mu_disconnect": {
                if (!connected) {
                    return safeUpdate(interaction, buildPanel(guild, s));
                }
                destroySession(guild.id);
                return safeUpdate(interaction, {
                    embeds: [nowPlayingEmbed(guild, getSession(guild.id))],
                    components: []
                });
            }

            default:
                return safeReply(interaction, { content: "❓ Botón desconocido.", flags: MessageFlags.Ephemeral });
        }

        return safeUpdate(interaction, buildPanel(guild, s));
    } catch (error) {
        console.error("[MÚSICA] Error en panel button:", error.message);
        return safeReply(interaction, { content: "❌ Error al procesar el botón.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
}

// ==================== TTS INTEGRATION ====================

function handleTTSActivity(guildId, active) {
    if (active) {
        activeTTSGuilds.add(guildId);
        const s = sessions.get(guildId);
        if (s && s.current && !s.pausedForTTS) {
            s.pausedForTTS = true;
            s.lastChannelId = s.channelId;
            try { if (s.player) s.player.pause(); } catch {}
        }
    } else {
        activeTTSGuilds.delete(guildId);
        const s = sessions.get(guildId);
        if (s && s.pausedForTTS) {
            s.pausedForTTS = false;
            if (s.current && !s.pausedByUser) {
                try { if (s.player) s.player.unpause(); } catch {}
            }
        }
    }
}

// ==================== MAIN INTERACTION HANDLER ====================

async function handleMusicInteraction(interaction, config, saveConfig) {
    if (interaction.isButton() && interaction.customId?.startsWith("mu_")) {
        await handlePanelButton(interaction, config);
        return true;
    }

    if (!interaction.isCommand()) return false;

    const musicCmds = new Set([
        "play", "pause", "resume", "skip", "stop", "queue",
        "nowplaying", "volume", "loop", "shuffle", "remove",
        "clearqueue", "disconnect", "music"
    ]);
    if (!musicCmds.has(interaction.commandName)) return false;

    try {
        switch (interaction.commandName) {
            case "play": await handlePlayCommand(interaction, config, saveConfig); break;
            case "pause": await handlePauseCommand(interaction, config); break;
            case "resume": await handleResumeCommand(interaction, config); break;
            case "skip": await handleSkipCommand(interaction, config); break;
            case "stop": await handleStopCommand(interaction, config); break;
            case "queue": await handleQueueCommand(interaction); break;
            case "nowplaying": await handleNowPlayingCommand(interaction); break;
            case "volume": await handleVolumeCommand(interaction, config); break;
            case "loop": await handleLoopCommand(interaction, config); break;
            case "shuffle": await handleShuffleCommand(interaction, config); break;
            case "remove": await handleRemoveCommand(interaction, config); break;
            case "clearqueue": await handleClearQueueCommand(interaction, config); break;
            case "disconnect": await handleDisconnectCommand(interaction, config); break;
            case "music": await handleMusicPanelCommand(interaction, config); break;
            default: return false;
        }
    } catch (error) {
        console.error(`[MÚSICA] Error en comando ${interaction.commandName}:`, error.message);
        await safeReply(interaction, {
            content: "❌ Ocurrió un error al procesar el comando.",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
    return true;
}

// ==================== SETUP ====================

async function setupMusicSystem(client) {
    ttsSystem.setTTSActivityHook(handleTTSActivity);

    client.on("voiceStateUpdate", (oldState, newState) => {
        const guild = oldState.guild || newState.guild;
        if (!guild) return;
        const s = sessions.get(guild.id);
        if (!s || !s.connection || s.connection.state.status === VoiceConnectionStatus.Destroyed) return;
        if (s.channelId !== newState.channelId && s.channelId !== oldState.channelId) return;

        const channel = guild.channels.cache.get(s.channelId);
        if (!channel) return;
        const humansInVoice = channel.members.filter(m => !m.user.bot);

        if (humansInVoice.size === 0) {
            scheduleLeave(s, guild.id, s.autoLeaveMs || DEFAULT_LEAVE_MS);
        } else {
            clearLeaveTimer(s);
        }
    });
}

module.exports = {
    handleMusicInteraction,
    setupMusicSystem,
    ensureMusicConfig,
    isActive: guildId => {
        const s = sessions.get(guildId);
        return Boolean(s && s.connection && s.connection.state.status !== VoiceConnectionStatus.Destroyed);
    }
};
