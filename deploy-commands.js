require("dotenv").config();

const {
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType
} = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("🐉 Centro de control de DRAGONS"),

    new SlashCommandBuilder()
        .setName("hola")
        .setDescription("Saluda al bot"),

    new SlashCommandBuilder()
        .setName("bienvenida")
        .setDescription("Configura el canal de bienvenida")
        .addChannelOption(option =>
            option
                .setName("canal")
                .setDescription("Canal donde se enviarán las bienvenidas")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("welcome")
        .setDescription("Configura el sistema de bienvenidas")
        .addSubcommand(sub =>
            sub
                .setName("setup")
                .setDescription("Configura todo el sistema de bienvenida de una vez")
                .addChannelOption(option =>
                    option
                        .setName("canal")
                        .setDescription("Canal donde se enviarán las bienvenidas")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("imagen")
                        .setDescription("URL del banner de bienvenida")
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("color")
                        .setDescription("Color del embed (ej: #A52BE2)")
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("mensaje")
                        .setDescription("Mensaje personalizado (usa {user}, {server}, {members}, {date})")
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("footer")
                        .setDescription("Texto del footer")
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("canal")
                .setDescription("Cambia el canal de bienvenidas")
                .addChannelOption(option =>
                    option
                        .setName("canal")
                        .setDescription("Canal donde se enviarán las bienvenidas")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("mensaje")
                .setDescription("Cambia el mensaje personalizado de bienvenida")
                .addStringOption(option =>
                    option
                        .setName("mensaje")
                        .setDescription("Mensaje con variables: {user}, {username}, {server}, {members}, {date}, {id}")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("imagen")
                .setDescription("Configura el banner de bienvenida (none para quitarlo)")
                .addStringOption(option =>
                    option
                        .setName("imagen")
                        .setDescription("URL de la imagen (escribe 'none' para eliminarla)")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("color")
                .setDescription("Cambia el color del embed")
                .addStringOption(option =>
                    option
                        .setName("color")
                        .setDescription("Color en formato hexadecimal (ej: #A52BE2)")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("footer")
                .setDescription("Cambia el footer del embed")
                .addStringOption(option =>
                    option
                        .setName("texto")
                        .setDescription("Texto del footer")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("activar")
                .setDescription("Activa el envío de bienvenidas")
        )
        .addSubcommand(sub =>
            sub
                .setName("desactivar")
                .setDescription("Desactiva el envío de bienvenidas")
        )
        .addSubcommand(sub =>
            sub
                .setName("probar")
                .setDescription("Envía una vista previa del mensaje de bienvenida")
        )
        .addSubcommand(sub =>
            sub
                .setName("config")
                .setDescription("Muestra la configuración actual de bienvenidas")
        ),

    new SlashCommandBuilder()
        .setName("embed")
        .setDescription("Crear un embed personalizado"),

        new SlashCommandBuilder()
        .setName("setticket")
        .setDescription("Configura el sistema de tickets")
        .addChannelOption(option =>
            option
                .setName("canal")
                .setDescription("Canal donde irá el panel")
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName("categoria")
                .setDescription("Categoría donde se crearán los tickets")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName("rol_staff")
                .setDescription("Rol que puede ver y gestionar tickets")
                .setRequired(false)
        )
        .addChannelOption(option =>
            option
                .setName("canal_logs")
                .setDescription("Canal donde se guardan los transcripts al cerrar")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("texto")
                .setDescription("Mensaje personalizado del panel (deja vacío para usar el del /panel)")
                .setRequired(false)
        ),

new SlashCommandBuilder()
    .setName("encuesta")
    .setDescription("Crear una encuesta")
    .addStringOption(option =>
        option
            .setName("pregunta")
            .setDescription("La pregunta de la encuesta")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("opciones")
            .setDescription("Opciones separadas por coma (mínimo 2, máximo 10)")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("duracion")
            .setDescription("Duración de la encuesta (30s, 5m, 1h, 1d...). Por defecto 1h")
    )
    .addBooleanOption(option =>
        option
            .setName("permite_cambiar")
            .setDescription("Permitir cambiar el voto. Por defecto: Sí")
    ),

    // ===== MODERACIÓN =====

    new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Advierte a un usuario")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario a advertir")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("motivo")
                .setDescription("Motivo de la advertencia")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Muestra las advertencias de un usuario")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario (si no pones ninguno, verás las tuyas)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("mute")
        .setDescription("Silencia (timeout) a un usuario")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario a silenciar")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("tiempo")
                .setDescription("Duración (ej: 10s, 5m, 1h, 2d, 1w)")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("unmute")
        .setDescription("Quita el silencio a un usuario")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario a desmutear")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Expulsa a un usuario del servidor")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario a expulsar")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("motivo")
                .setDescription("Motivo")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Banea a un usuario del servidor")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario a banear")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("motivo")
                .setDescription("Motivo")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Desbanea a un usuario")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("ID del usuario baneado")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Borra mensajes del canal")
        .addIntegerOption(option =>
            option
                .setName("cantidad")
                .setDescription("Número de mensajes a borrar (1-100)")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("setlogs")
        .setDescription("Configura el canal donde se registran los logs del servidor")
        .addChannelOption(option =>
            option
                .setName("canal")
                .setDescription("Canal de logs")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("categoria")
                .setDescription("Categoría de logs (si no pones ninguna, se usa para todo)")
                .setRequired(false)
                .addChoices(
                    { name: "Mensajes", value: "mensajes" },
                    { name: "Miembros", value: "miembros" },
                    { name: "Moderación", value: "moderacion" },
                    { name: "Canales", value: "canales" },
                    { name: "Tickets", value: "tickets" },
                    { name: "Servidor", value: "servidor" }
                )
        ),

    new SlashCommandBuilder()
        .setName("sorteo")
        .setDescription("🎁 Crea un sorteo")
        .addStringOption(option =>
            option
                .setName("premio")
                .setDescription("Premio del sorteo")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("duracion")
                .setDescription("Duración del sorteo (ej: 30s, 5m, 1h, 2d)")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("ganadores")
                .setDescription("Número de ganadores (por defecto 1)")
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(false)
        )
        .addChannelOption(option =>
            option
                .setName("canal")
                .setDescription("Canal del sorteo (si no pones ninguno, usa el del panel)")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("tts")
        .setDescription("🔊 Sistema de voz: reproduce texto en el canal de voz configurado")
        .addStringOption(option =>
            option
                .setName("texto")
                .setDescription("Texto a decir (si lo omitas verás el estado del sistema)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("sugerir")
        .setDescription("💡 Envía una sugerencia al servidor")
        .addStringOption(option =>
            option
                .setName("sugerencia")
                .setDescription("Tu sugerencia")
                .setRequired(true)
        ),

    // ===== DIVERSIÓN =====

    new SlashCommandBuilder()
        .setName("8ball")
        .setDescription("🎱 La bola 8 responde tu pregunta")
        .addStringOption(option =>
            option
                .setName("pregunta")
                .setDescription("Tu pregunta")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("coinflip")
        .setDescription("🪙 Lanza una moneda al aire (cara o cruz)"),

    new SlashCommandBuilder()
        .setName("dice")
        .setDescription("🎲 Lanza un dado")
        .addIntegerOption(option =>
            option
                .setName("caras")
                .setDescription("Número de caras del dado (2-1000)")
                .setMinValue(2)
                .setMaxValue(1000)
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("ship")
        .setDescription("💘 Mide la compatibilidad entre dos usuarios")
        .addUserOption(option =>
            option
                .setName("usuario1")
                .setDescription("Primer usuario")
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName("usuario2")
                .setDescription("Segundo usuario")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("roast")
        .setDescription("🔥 Insulta de forma graciosa a un usuario")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario (si no pones ninguno, te insulta a ti)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("joke")
        .setDescription("😂 Cuenta un chiste aleatorio"),

    new SlashCommandBuilder()
        .setName("meme")
        .setDescription("😂 Envía un meme aleatorio"),

    new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("🖼️ Muestra el avatar de un usuario")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario (si no pones ninguno, muestro tu avatar)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("hug")
        .setDescription("🫂 Dale un abrazo a alguien")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario (si no pones ninguno, abraza al bot)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("slap")
        .setDescription("👋 Dale un tortazo a alguien")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario (si no pones ninguno, te tortazas a ti mismo)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("pat")
        .setDescription("🤗 Acaricia la cabeza de alguien")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario (si no pones ninguno, acaricias al bot)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("kiss")
        .setDescription("💋 Dale un beso a alguien")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario al que besar")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("rate")
        .setDescription("⭐ Puntúa algo del 1 al 100")
        .addStringOption(option =>
            option
                .setName("cosa")
                .setDescription("Lo que quieres puntuar (ej: tu día, una película...)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("choose")
        .setDescription("🤔 El dragón elige por ti (necesitas al menos 2 opciones)")
        .addStringOption(option =>
            option
                .setName("opcion1")
                .setDescription("Opción 1")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("opcion2")
                .setDescription("Opción 2")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("opcion3")
                .setDescription("Opción 3 (opcional)")
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("opcion4")
                .setDescription("Opción 4 (opcional)")
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("opcion5")
                .setDescription("Opción 5 (opcional)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("rps")
        .setDescription("✊✋✌️ Piedra, papel o tijera contra el bot"),

    new SlashCommandBuilder()
        .setName("trivia")
        .setDescription("📚 Pregunta de trivia con 4 opciones"),

    new SlashCommandBuilder()
        .setName("quiz")
        .setDescription("🧠 Quiz de 5 preguntas: ¿cuántas aciertas?"),

    new SlashCommandBuilder()
        .setName("guess")
        .setDescription("🔢 Adivina el número del 1 al 100 (7 intentos)"),

    new SlashCommandBuilder()
        .setName("roulette")
        .setDescription("🎰 Ruleta de la suerte"),

    new SlashCommandBuilder()
        .setName("fight")
        .setDescription("🥊 Dos usuarios se pelean a puñetazos")
        .addUserOption(option =>
            option
                .setName("usuario1")
                .setDescription("Primer combatiente")
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName("usuario2")
                .setDescription("Segundo combatiente")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("battle")
        .setDescription("⚔️ Batalla por turnos entre dos usuarios")
        .addUserOption(option =>
            option
                .setName("usuario1")
                .setDescription("Primer combatiente")
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName("usuario2")
                .setDescription("Segundo combatiente")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("duelo")
        .setDescription("🤠 Duelo al amanecer entre dos usuarios")
        .addUserOption(option =>
            option
                .setName("usuario1")
                .setDescription("Primer pistolero")
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName("usuario2")
                .setDescription("Segundo pistolero")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("fortune")
        .setDescription("🔮 Predice tu fortuna"),

    new SlashCommandBuilder()
        .setName("magicball")
        .setDescription("✨ Bola mágica: responde sí o no")
        .addStringOption(option =>
            option
                .setName("pregunta")
                .setDescription("Tu pregunta")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("compliment")
        .setDescription("💝 Envía un cumplido a alguien")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario (si no pones ninguno, te lo dedico a ti)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("challenge")
        .setDescription("🏆 Te propone un reto aleatorio"),

    new SlashCommandBuilder()
        .setName("random")
        .setDescription("🎲 Acción aleatoria para la comunidad"),

    new SlashCommandBuilder()
        .setName("boss")
        .setDescription("👹 ¡Alto al jefe! Todos atacan a la vez")
        .addStringOption(option =>
            option
                .setName("jefe")
                .setDescription("Nombre del jefe (si no pones ninguno, será el Dragón Ancestral)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("minigame")
        .setDescription("🎮 Menú de minijuegos: elegirás uno para jugar"),

    new SlashCommandBuilder()
        .setName("dragrace")
        .setDescription("🏎️ Carrera de dragones: hasta 4 participantes")
        .addUserOption(option =>
            option
                .setName("usuario1")
                .setDescription("Participante 1")
                .setRequired(false)
        )
        .addUserOption(option =>
            option
                .setName("usuario2")
                .setDescription("Participante 2")
                .setRequired(false)
        )
        .addUserOption(option =>
            option
                .setName("usuario3")
                .setDescription("Participante 3")
                .setRequired(false)
        )
        .addUserOption(option =>
            option
                .setName("usuario4")
                .setDescription("Participante 4")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("treasure")
        .setDescription("💰 Busca el tesoro escondido en la cueva del dragón"),

    new SlashCommandBuilder()
        .setName("casino")
        .setDescription("🎰 Juega en el casino del dragón (sin apuestas reales)"),

    new SlashCommandBuilder()
        .setName("pokemon")
        .setDescription("⚡ Combate pokémon contra el bot")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Entrenador (si no pones ninguno, serás tú)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("dragonfight")
        .setDescription("🐉 Lucha contra el mismísimo dragón")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario (si no pones ninguno, luchas tú)")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("🐉 Información detallada de un miembro del servidor")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario (menciona o selecciona; si no pones ninguno, serás tú)")
                .setRequired(false)
        ),

    // ===== MÚSICA =====

    new SlashCommandBuilder()
        .setName("play")
        .setDescription("🎵 Reproduce una canción (nombre o URL)")
        .addStringOption(option =>
            option
                .setName("cancion")
                .setDescription("Nombre de la canción o URL de YouTube")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("pause")
        .setDescription("⏸️ Pausa la reproducción"),

    new SlashCommandBuilder()
        .setName("resume")
        .setDescription("▶️ Reanuda la reproducción"),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription("⏭️ Salta a la siguiente canción"),

    new SlashCommandBuilder()
        .setName("stop")
        .setDescription("⏹️ Detiene la música y vacía la cola"),

    new SlashCommandBuilder()
        .setName("queue")
        .setDescription("📜 Muestra la cola de reproducción"),

    new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription("🎶 Muestra la canción que se está reproduciendo"),

    new SlashCommandBuilder()
        .setName("volume")
        .setDescription("🔊 Ajusta el volumen de la música")
        .addIntegerOption(option =>
            option
                .setName("nivel")
                .setDescription("Nivel de volumen (0-100). Sin valor muestra el actual")
                .setMinValue(0)
                .setMaxValue(100)
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("loop")
        .setDescription("🔁 Cambia el modo de repetición: canción → cola → desactivado"),

    new SlashCommandBuilder()
        .setName("shuffle")
        .setDescription("🔀 Mezcla la cola de reproducción"),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription("🗑️ Quita una canción de la cola por posición")
        .addIntegerOption(option =>
            option
                .setName("posicion")
                .setDescription("Posición de la canción en la cola")
                .setMinValue(1)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("clearqueue")
        .setDescription("🧹 Vacía la cola de reproducción"),

    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription("📴 Desconecta el bot del canal de voz"),

    new SlashCommandBuilder()
        .setName("music")
        .setDescription("🎵 Panel de control de música"),

].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
const guildIds = [
    "1476978589575413813",
    "1516175707909259415"
];

(async () => {
    try {
        console.log("Registrando comandos...");

        for (const guildId of guildIds) {
            await rest.put(
                Routes.applicationGuildCommands(
                    "1529523873781911662",
                    guildId
                ),
                { body: commands }
            );
            console.log(`Comandos registrados en el servidor ${guildId}.`);
        }

        console.log("✅ Comandos registrados.");
    } catch (error) {
        console.error(error);
    }
})();
