const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require("discord.js");

const DRAGON_COLOR = "#A52BE2";
const GOLD_COLOR = "#FFD700";
const GREEN_COLOR = "#57F287";
const RED_COLOR = "#ED4245";

const gameStates = new Map();

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dragonEmbed() {
    return new EmbedBuilder()
        .setColor(DRAGON_COLOR)
        .setFooter({ text: "🐉 DRAGONS | Diversión" })
        .setTimestamp();
}

function hashIds(...ids) {
    let h = 0;
    const str = ids.join("|");
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h;
}

function getUser(interaction, key) {
    return interaction.options.getUser(key);
}

function getUserOption(interaction, key) {
    const target = getUser(interaction, key);
    return target || interaction.user;
}

function baseEmbedFor(interaction) {
    return dragonEmbed()
        .setAuthor({
            name: interaction.user.username,
            iconURL: interaction.user.displayAvatarURL({ size: 64 })
        });
}

function formatUsers(users) {
    return users.map(u => `**${u.username}**`).join(" ");
}

const BALL_ANSWERS = [
    "Sí, definitivamente.",
    "Sin duda alguna.",
    "Puedes contar con ello.",
    "Así lo veo.",
    "Lo más probable.",
    "Las señales apuntan a que sí.",
    "No cuentes con ello.",
    "Mi respuesta es no.",
    "Pregunta de nuevo más tarde.",
    "No puedo predecirlo ahora.",
    "Concéntrate y pregunta otra vez.",
    "No lo veo tan claro.",
    "Respuesta nebulosa, intenta de nuevo.",
    "Mejor no te lo digo ahora.",
    "Es muy incierto.",
    "El dragón lo dice: sí."
];

const JOKES = [
    "¿Por qué los programadores confunden Halloween con Navidad? Porque OCT 31 == DEC 25.",
    "¿Qué le dice un bit a otro? Nos vemos en el bus.",
    "¿Cómo se despiden los algoritmos? Algoritmo la próxima.",
    "Hay 10 tipos de personas: las que entienden binario y las que no.",
    "¿Por qué el programador no nada en el mar? Porque odia los bugs.",
    "¿Qué hace un pez en Internet? Nada.",
    "¿Por qué los pájaros no usan WhatsApp? Porque ya tienen Twitter.",
    "Estaba jugando a las escondidas y me dijeron 'tú ganas', no sabía dónde esconderme.",
    "¿Qué le dijo un circuito a otro? Tú me complementas.",
    "El Wi-Fi y yo tenemos algo en común: cuando estamos lejos, nos desconectamos.",
    "¿Por qué el libro de matemáticas está triste? Porque tiene demasiados problemas.",
    "Soy como la v1.0: siempre en beta, pero funcional."
];

const ROASTS = [
    "No eres feo, solo estás en modo ahorro de energía.",
    "Si la suerte fuese dinero, estarías en bancarrota.",
    "Eres como un bug: apareces cuando menos te esperan.",
    "Tu nivel de suerte es como un offline: no existe.",
    "No digo que seas tonto, pero hasta un bot te supera en CI.",
    "Eres la excepción que confirma la regla de que todos tenemos talento.",
    "Tu carisma es como el espacio exterior: vacío y frío.",
    "Si fueras un programa, tu código sería spaghetti con virus.",
    "Pareces la función que nadie usó jamás: existes, pero sin propósito.",
    "Eres la pausa de anuncios en medio de una buena película.",
    "No eres lento, solo estás en modo de ahorro de FPS.",
    "Tu encanto es como el teclado sin tecla Enter: no llega a nada."
];

const COMPLIMENTS = [
    "Eres más brillante que el oro de un dragón.",
    "Tu sonrisa ilumina más que un servidor entero.",
    "Tienes un corazón tan grande como el de un dragón anciano.",
    "Eres la mejor versión de ti mismo, y eso ya es increíble.",
    "Tu energía es contagiosa (en el buen sentido).",
    "Hasta un dragón se quedaría en ascuas por ti.",
    "Eres más legendario que la historia de DRAGONS.",
    "Tu esfuerzo vale más que cualquier tesoro.",
    "Eres el respaldo perfecto en cualquier equipo.",
    "Tu manera de ser hace este servidor mucho mejor.",
    "Tienes una chispa que ni el fuego de un dragón iguala.",
    "Eres una estrella en este reino."
];

const FORTUNES = [
    "Pronto recibirás un mensaje que te alegrará el día.",
    "Un gran poder conlleva una gran responsabilidad... y una siesta.",
    "Hoy es un buen día para comer algo delicioso.",
    "Tu futuro está lleno de escaleras mecánicas.",
    "Algo bueno está a punto de ocurrir, mantén los ojos abiertos.",
    "Un desconocido te sonreirá hoy.",
    "No dejes para mañana lo que puedas posponer pasado mañana.",
    "La suerte favorece a los audaces (y a los que tiran el dado).",
    "Pronto escucharás una buena canción.",
    "Un pequeño acto de bondad hoy, dará grandes frutos mañana.",
    "Tu próxima decisión será recordada... por ti.",
    "Los dragones te sonríen: buen día para aventuras."
];

const CHALLENGES = [
    "Di 5 veces seguidas 'el dragón rojo ruge raro' sin trabarte.",
    "Manda el mensaje más épico que puedas en este canal.",
    "Inventa un nombre de dragón y presume de él.",
    "Describe tu día usando solo emojis.",
    "Canta una canción en el canal de voz (si puedes).",
    "Escribe un mini cuento de 2 líneas sobre un dragón.",
    "Comparte tu comida favorita con el resto del reino.",
    "Retrocede 10 años mentalmente y saluda como entonces.",
    "Di 'me rindo' pero en español medieval.",
    "Crea una alianza ficticia con otro usuario del chat."
];

const RANDOM_ACTIONS = [
    "🐉 Un dragón sobrevuela el servidor lanzando chispas de alegría.",
    "⚡ Un rayo mágico convierte el aburrimiento en emoción.",
    "🍀 La suerte del dragón te da un punto extra de carisma.",
    "🔮 Una profecía se cumple: hoy habrá risas.",
    "🎇 Fuegos artificiales iluminan el chat.",
    "🛡️ Una armadura invisible te protege del aburrimiento.",
    "🏰 El castillo se sacude... era un bostezo del dragón guardián.",
    "💎 Aparece una gema mágica que todos quieren ver.",
    "🌋 Un volcán ficticio eructa confeti.",
    "🧙 Un mago te concede 3 segundos de vuelo imaginario."
];

const TRIVIA = [
    { q: "¿Cuál es el planeta más grande del sistema solar?", a: ["Júpiter", "Saturno", "Tierra", "Marte"], correct: 0 },
    { q: "¿Qué gas respiramos principalmente para vivir?", a: ["Oxígeno", "Nitrógeno", "Helio", "Neón"], correct: 0 },
    { q: "¿Cuántos continentes hay en el planeta?", a: ["5", "6", "7", "8"], correct: 2 },
    { q: "¿Cuál es el animal más rápido del mundo?", a: ["Guepardo", "Halcón peregrino", "León", "Caballo"], correct: 1 },
    { q: "¿En qué año llegó el ser humano a la Luna?", a: ["1965", "1969", "1972", "1975"], correct: 1 },
    { q: "¿Cuál es el océano más grande?", a: ["Atlántico", "Índico", "Pacífico", "Ártico"], correct: 2 },
    { q: "¿Cuántos lados tiene un hexágono?", a: ["5", "6", "7", "8"], correct: 1 },
    { q: "¿Qué instrumento mide la temperatura?", a: ["Barómetro", "Termómetro", "Velocímetro", "Higrómetro"], correct: 1 },
    { q: "¿Cuál es el idioma más hablado del mundo?", a: ["Inglés", "Español", "Mandarín", "Hindi"], correct: 2 },
    { q: "¿Qué planeta es conocido como el Planeta Rojo?", a: ["Venus", "Marte", "Mercurio", "Júpiter"], correct: 1 }
];

const POKEMON_LIKE = [
    { name: "Puroflama", emoji: "🔥", hp: 80, atk: 25, def: 12 },
    { name: "Truenoala", emoji: "⚡", hp: 70, atk: 22, def: 15 },
    { name: "Aquaescama", emoji: "🌊", hp: 90, atk: 18, def: 18 },
    { name: "Rocadura", emoji: "🪨", hp: 95, atk: 20, def: 22 },
    { name: "Hojalito", emoji: "🌿", hp: 75, atk: 21, def: 14 },
    { name: "Nebuloso", emoji: "☁️", hp: 65, atk: 19, def: 10 }
];

const DRAGON_ATTACKS = [
    { name: "Aliento de fuego", emoji: "🔥", dmg: [20, 35] },
    { name: "Zarpazo devastador", emoji: "🐾", dmg: [15, 30] },
    { name: "Cola de hierro", emoji: "⛓️", dmg: [12, 28] },
    { name: "Rugido ensordecedor", emoji: "📢", dmg: [10, 25] },
    { name: "Vuelo ardiente", emoji: "🌪️", dmg: [18, 32] }
];

function bar(value, max, size = 10) {
    const filled = Math.max(0, Math.min(size, Math.round((value / max) * size)));
    return "█".repeat(filled) + "░".repeat(size - filled);
}

async function replyError(interaction, content) {
    return interaction.reply({
        content,
        flags: MessageFlags.Ephemeral
    }).catch(() => {});
}

async function reply(interaction, options) {
    return interaction.reply(options).catch(() => {});
}

async function update(interaction, options) {
    return interaction.update(options).catch(() => {});
}

async function deferReply(interaction) {
    return interaction.deferReply().catch(() => {});
}

async function editReply(interaction, options) {
    return interaction.editReply(options).catch(() => {});
}

async function fetchReply(interaction) {
    return interaction.fetchReply().catch(() => null);
}

async function eightBall(interaction) {
    const question = interaction.options.getString("pregunta");
    const embed = baseEmbedFor(interaction)
        .setTitle("🎱 Bola 8")
        .setDescription(`**Pregunta:** ${question}\n\n🔮 **Respuesta:** ${pick(BALL_ANSWERS)}`)
        .setColor(DRAGON_COLOR);
    await reply(interaction, { embeds: [embed] });
}

async function coinflip(interaction) {
    const result = Math.random() < 0.5 ? "Cara" : "Cruz";
    const emoji = result === "Cara" ? "🪙" : "🪙";
    const embed = baseEmbedFor(interaction)
        .setTitle("🪙 Lanzamiento de moneda")
        .setDescription(`La moneda giró en el aire...\n\n**Resultado: ${result}**`)
        .setColor(GOLD_COLOR);
    await reply(interaction, { embeds: [embed] });
}

async function dice(interaction) {
    const faces = interaction.options.getInteger("caras") || 6;
    if (faces < 2 || faces > 1000) {
        return replyError(interaction, "❌ El dado debe tener entre 2 y 1000 caras.");
    }
    const result = rand(1, faces);
    const emoji = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][result - 1] || "🎲";
    const embed = baseEmbedFor(interaction)
        .setTitle("🎲 Dado")
        .setDescription(`Lanzaste un dado de **${faces}** caras.\n\n**Resultado: ${emoji} ${result}**`);
    await reply(interaction, { embeds: [embed] });
}

async function ship(interaction) {
    const user1 = getUserOption(interaction, "usuario1");
    const user2 = getUserOption(interaction, "usuario2");
    if (user1.id === user2.id) {
        return replyError(interaction, "❌ Elige dos usuarios distintos para el ship.");
    }
    const percent = hashIds(user1.id, user2.id) % 101;
    const barStr = bar(percent, 100, 10);
    const verdict = percent >= 85 ? "❤️ ¡Un amor legendario!" :
        percent >= 65 ? "💕 Muy buena pareja." :
        percent >= 45 ? "🤝 Puede funcionar con esfuerzo." :
        percent >= 25 ? "😬 Complicado..." :
        "💔 Mejor cada uno por su lado.";
    const embed = dragonEmbed()
        .setTitle("💘 Test de compatibilidad")
        .setDescription(
            `💘 **${user1.username}** ❤️ **${user2.username}**\n\n` +
            `📊 **Compatibilidad:** ${percent}%\n` +
            `\`${barStr}\`\n\n` +
            `${verdict}`
        )
        .setColor(percent >= 65 ? GREEN_COLOR : percent >= 45 ? GOLD_COLOR : RED_COLOR);
    await reply(interaction, { embeds: [embed] });
}

async function roast(interaction) {
    const target = getUserOption(interaction, "usuario");
    const embed = baseEmbedFor(interaction)
        .setTitle("🔥 Roast")
        .setDescription(`${target}, prepárate...\n\n**${pick(ROASTS)}**`)
        .setColor(DRAGON_COLOR);
    await reply(interaction, { embeds: [embed] });
}

async function joke(interaction) {
    const embed = baseEmbedFor(interaction)
        .setTitle("😂 Chiste aleatorio")
        .setDescription(pick(JOKES));
    await reply(interaction, { embeds: [embed] });
}

async function meme(interaction) {
    await deferReply(interaction);
    const fallback = pick([
        "https://i.imgur.com/8N4gqLu.jpg",
        "https://i.imgur.com/5jzEkgQ.jpg",
        "https://i.imgur.com/mQ5yvFm.jpg",
        "https://i.imgur.com/0aZ0tXk.jpg",
        "https://i.imgur.com/JL6YqQp.jpg",
        "https://i.imgur.com/4bY3e1c.jpg"
    ]);

    let imageUrl = fallback;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch("https://meme-api.com/gimme", {
            signal: controller.signal,
            headers: { "User-Agent": "DragonBot/1.0" }
        });
        clearTimeout(timeout);
        if (res.ok) {
            const data = await res.json();
            if (data && data.url) imageUrl = data.url;
        }
    } catch {}

    const embed = baseEmbedFor(interaction)
        .setTitle("😂 Meme del reino")
        .setImage(imageUrl);
    await editReply(interaction, { embeds: [embed] });
}

async function avatar(interaction) {
    const target = getUserOption(interaction, "usuario");
    const avatarUrl = target.displayAvatarURL({ size: 1024, extension: "png" });
    const embed = dragonEmbed()
        .setTitle(`🖼️ Avatar de ${target.username}`)
        .setImage(avatarUrl)
        .setColor(DRAGON_COLOR);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("Ver en grande")
            .setURL(avatarUrl)
    );
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function hug(interaction) {
    const target = getUserOption(interaction, "usuario");
    const embed = baseEmbedFor(interaction)
        .setTitle("🫂 ¡Abrazo!")
        .setDescription(`${interaction.user} le da un abrazo gigante a ${target} 🤗`)
        .setColor(GREEN_COLOR);
    await reply(interaction, { embeds: [embed] });
}

async function slap(interaction) {
    const target = getUserOption(interaction, "usuario");
    const embed = baseEmbedFor(interaction)
        .setTitle("👋 ¡Tortazo!")
        .setDescription(`${interaction.user} le mete un tortazo a ${target} 😂💥`)
        .setColor(RED_COLOR);
    await reply(interaction, { embeds: [embed] });
}

async function pat(interaction) {
    const target = getUserOption(interaction, "usuario");
    const embed = baseEmbedFor(interaction)
        .setTitle("🤗 Caricias")
        .setDescription(`${interaction.user} acaricia la cabeza de ${target} 🐾✨`)
        .setColor(GREEN_COLOR);
    await reply(interaction, { embeds: [embed] });
}

async function kiss(interaction) {
    const target = getUserOption(interaction, "usuario");
    if (target.id === interaction.user.id) {
        return replyError(interaction, "❌ No puedes besarte a ti mismo... bueno, puedes intentarlo.");
    }
    const embed = baseEmbedFor(interaction)
        .setTitle("💋 ¡Un beso!")
        .setDescription(`${interaction.user} le da un beso a ${target} 💞`)
        .setColor(DRAGON_COLOR);
    await reply(interaction, { embeds: [embed] });
}

async function rate(interaction) {
    const thing = interaction.options.getString("cosa") || "tu día";
    const score = rand(1, 100);
    const emoji = score >= 80 ? "🤩" : score >= 60 ? "😄" : score >= 40 ? "😐" : score >= 20 ? "😕" : "😭";
    const embed = baseEmbedFor(interaction)
        .setTitle("⭐ Rate")
        .setDescription(`**${thing}**\n\n${emoji} **${score}/100**`);
    await reply(interaction, { embeds: [embed] });
}

async function choose(interaction) {
    const options = [];
    for (let i = 1; i <= 5; i++) {
        const val = interaction.options.getString(`opcion${i}`);
        if (val) options.push(val);
    }
    if (options.length < 2) {
        return replyError(interaction, "❌ Necesitas al menos 2 opciones.");
    }
    const choice = pick(options);
    const embed = baseEmbedFor(interaction)
        .setTitle("🤔 El dragón elige")
        .setDescription(
            `**Opciones:**\n${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\n` +
            `🐉 **Mi elección: ${choice}**`
        );
    await reply(interaction, { embeds: [embed] });
}

async function rps(interaction) {
    const gameKey = `rps_${interaction.user.id}_${Date.now()}`;
    const choices = [
        { id: "piedra", emoji: "🪨", beats: "tijera" },
        { id: "papel", emoji: "📄", beats: "piedra" },
        { id: "tijera", emoji: "✂️", beats: "papel" }
    ];
    const embed = baseEmbedFor(interaction)
        .setTitle("✂️ Piedra, papel o tijera")
        .setDescription("Elige tu jugada con los botones 👇");
    const row = new ActionRowBuilder().addComponents(
        choices.map(c =>
            new ButtonBuilder()
                .setCustomId(`${gameKey}_${c.id}`)
                .setLabel(c.id[0].toUpperCase() + c.id.slice(1))
                .setEmoji(c.emoji)
                .setStyle(ButtonStyle.Primary)
        )
    );
    gameStates.set(gameKey, { choices, userId: interaction.user.id });
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleRpsButton(interaction) {
    const [gameKey, userChoiceId] = interaction.customId.split("_").slice(0, 2).length === 2
        ? [interaction.customId.replace(/_piedra$|_papel$|_tijera$/, ""), interaction.customId.split("_").pop()]
        : [null, null];

    if (!gameKey) return false;
    const game = gameStates.get(gameKey);
    if (!game || game.userId !== interaction.user.id) return false;

    const botChoice = pick(game.choices);
    const userChoice = game.choices.find(c => c.id === userChoiceId);

    let result;
    if (userChoice.id === botChoice.id) {
        result = "🤝 ¡Empate!";
    } else if (userChoice.beats === botChoice.id) {
        result = "🎉 ¡Ganaste!";
    } else {
        result = "😤 Gané yo.";
    }

    const embed = baseEmbedFor(interaction)
        .setTitle("✂️ Piedra, papel o tijera")
        .setDescription(
            `**Tu jugada:** ${userChoice.emoji} ${userChoice.id}\n` +
            `**Mi jugada:** ${botChoice.emoji} ${botChoice.id}\n\n` +
            `**${result}**`
        );
    const disabledRow = new ActionRowBuilder().addComponents(
        game.choices.map(c =>
            new ButtonBuilder()
                .setCustomId(`${gameKey}_${c.id}`)
                .setLabel(c.id[0].toUpperCase() + c.id.slice(1))
                .setEmoji(c.emoji)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        )
    );
    gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [disabledRow] });
    return true;
}

async function trivia(interaction) {
    const question = pick(TRIVIA);
    const gameKey = `trivia_${interaction.user.id}_${Date.now()}`;
    const letters = ["🇦", "🇧", "🇨", "🇩"];
    const embed = baseEmbedFor(interaction)
        .setTitle("🧠 Trivia")
        .setDescription(`**${question.q}**\n\nElige una respuesta con los botones 👇`)
        .addFields(question.a.map((a, i) => ({ name: `${letters[i]} ${a}`, value: "\u200b", inline: true })));
    const row = new ActionRowBuilder().addComponents(
        question.a.map((a, i) =>
            new ButtonBuilder()
                .setCustomId(`${gameKey}_${i}`)
                .setLabel(letters[i])
                .setStyle(i === question.correct ? ButtonStyle.Success : ButtonStyle.Primary)
        )
    );
    gameStates.set(gameKey, { question, userId: interaction.user.id });
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleTriviaButton(interaction) {
    const match = /^(trivia_\d+_\d+)_(\d)$/.exec(interaction.customId);
    if (!match) return false;
    const gameKey = match[1];
    const answerIndex = Number(match[2]);
    const game = gameStates.get(gameKey);
    if (!game || game.userId !== interaction.user.id) return false;

    const correct = answerIndex === game.question.correct;
    const letters = ["🇦", "🇧", "🇨", "🇩"];
    const correctAnswer = game.question.a[game.question.correct];

    const embed = baseEmbedFor(interaction)
        .setTitle("🧠 Trivia")
        .setDescription(`**${game.question.q}**\n\n**${correct ? "✅ ¡Correcto!" : "❌ ¡Incorrecto!"}**\n\nLa respuesta correcta era: **${correctAnswer}**`);
    const disabledRow = new ActionRowBuilder().addComponents(
        game.question.a.map((a, i) =>
            new ButtonBuilder()
                .setCustomId(`${gameKey}_${i}`)
                .setLabel(letters[i])
                .setStyle(i === game.question.correct ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(true)
        )
    );
    gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [disabledRow] });
    return true;
}

async function quiz(interaction) {
    const shuffled = [...TRIVIA].sort(() => Math.random() - 0.5).slice(0, 5);
    const gameKey = `quiz_${interaction.user.id}_${Date.now()}`;
    const letters = ["🇦", "🇧", "🇨", "🇩"];
    const state = { questions: shuffled, index: 0, score: 0, userId: interaction.user.id };
    gameStates.set(gameKey, state);

    const q = state.questions[0];
    const embed = baseEmbedFor(interaction)
        .setTitle("📝 Mini cuestionario")
        .setDescription(`**Pregunta 1 de ${state.questions.length}**\n\n**${q.q}**`)
        .addFields(q.a.map((a, i) => ({ name: `${letters[i]} ${a}`, value: "\u200b", inline: true })));
    const row = new ActionRowBuilder().addComponents(
        q.a.map((a, i) =>
            new ButtonBuilder()
                .setCustomId(`${gameKey}_${i}`)
                .setLabel(letters[i])
                .setStyle(ButtonStyle.Primary)
        )
    );
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleQuizButton(interaction) {
    const match = /^(quiz_\d+_\d+)_(\d)$/.exec(interaction.customId);
    if (!match) return false;
    const gameKey = match[1];
    const answerIndex = Number(match[2]);
    const game = gameStates.get(gameKey);
    if (!game || game.userId !== interaction.user.id) return false;

    const current = game.questions[game.index];
    const correct = answerIndex === current.correct;
    if (correct) game.score++;

    game.index++;
    const letters = ["🇦", "🇧", "🇨", "🇩"];

    if (game.index < game.questions.length) {
        const q = game.questions[game.index];
        const embed = baseEmbedFor(interaction)
            .setTitle("📝 Mini cuestionario")
            .setDescription(
                (correct ? "✅ ¡Correcto! " : `❌ Incorrecto. La respuesta era **${current.a[current.correct]}**. `) +
                `Puntos: **${game.score}**\n\n` +
                `**Pregunta ${game.index + 1} de ${game.questions.length}**\n\n**${q.q}**`
            )
            .addFields(q.a.map((a, i) => ({ name: `${letters[i]} ${a}`, value: "\u200b", inline: true })));
        const row = new ActionRowBuilder().addComponents(
            q.a.map((a, i) =>
                new ButtonBuilder()
                    .setCustomId(`${gameKey}_${i}`)
                    .setLabel(letters[i])
                    .setStyle(ButtonStyle.Primary)
            )
        );
        await update(interaction, { embeds: [embed], components: [row] });
        return true;
    }

    const finalVerdict = game.score >= 4 ? "🏆 ¡Impresionante!" :
        game.score >= 3 ? "🎉 ¡Muy bien!" :
        game.score >= 2 ? "👍 Nada mal." :
        "😅 Sigue practicando.";
    const embed = baseEmbedFor(interaction)
        .setTitle("📝 Cuestionario terminado")
        .setDescription(`**Puntuación final: ${game.score}/${game.questions.length}**\n\n${finalVerdict}`);
    const disabledRow = new ActionRowBuilder().addComponents(
        current.a.map((a, i) =>
            new ButtonBuilder()
                .setCustomId(`${gameKey}_${i}`)
                .setLabel(letters[i])
                .setStyle(i === current.correct ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(true)
        )
    );
    gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [disabledRow] });
    return true;
}

async function guess(interaction) {
    const secret = rand(1, 100);
    const gameKey = `guess_${interaction.user.id}_${Date.now()}`;
    gameStates.set(gameKey, {
        secret,
        attempts: 0,
        maxAttempts: 7,
        low: 1,
        high: 100,
        userId: interaction.user.id
    });

    const embed = baseEmbedFor(interaction)
        .setTitle("🎯 Adivina el número")
        .setDescription(
            "He pensado un número del **1 al 100**.\n\n" +
            "Pulsa el botón para lanzar tu intento. Te daré pistas de mayor/menor."
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_try`)
            .setLabel("🎯 Intentar")
            .setStyle(ButtonStyle.Primary)
    );
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleGuessTry(interaction) {
    const gameKey = interaction.customId.replace(/_try$/, "");
    const game = gameStates.get(gameKey);
    if (!game || game.userId !== interaction.user.id) return false;

    const modal = new ModalBuilder()
        .setCustomId(`${gameKey}_modal`)
        .setTitle("🎯 Adivina el número");
    const input = new TextInputBuilder()
        .setCustomId("guess_number")
        .setLabel("Tu número (1-100)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(3);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return true;
}

async function handleGuessModal(interaction) {
    const match = /^(guess_\d+_\d+)_modal$/.exec(interaction.customId);
    if (!match) return false;
    const gameKey = match[1];
    const game = gameStates.get(gameKey);
    if (!game || game.userId !== interaction.user.id) return false;

    const raw = interaction.fields.getTextInputValue("guess_number");
    const number = parseInt(raw, 10);
    if (isNaN(number)) {
        return replyError(interaction, "❌ Eso no es un número válido.");
    }

    game.attempts++;
    let message;
    let win = false;

    if (number === game.secret) {
        win = true;
        message = `🎉 ¡CORRECTO! El número era **${game.secret}**.\nLo adivinaste en **${game.attempts}** intento${game.attempts > 1 ? "s" : ""}.`;
    } else if (game.attempts >= game.maxAttempts) {
        message = `😵 Te quedaste sin intentos. El número era **${game.secret}**.`;
    } else if (number < game.secret) {
        game.low = Math.max(game.low, number);
        message = `📈 **Más alto.** Intentos: ${game.attempts}/${game.maxAttempts} (rango ${game.low}-${game.high})`;
    } else {
        game.high = Math.min(game.high, number);
        message = `📉 **Más bajo.** Intentos: ${game.attempts}/${game.maxAttempts} (rango ${game.low}-${game.high})`;
    }

    const embed = baseEmbedFor(interaction)
        .setTitle("🎯 Adivina el número")
        .setDescription(
            win || game.attempts >= game.maxAttempts
                ? message
                : `${message}\n\nPulsa el botón para otro intento.`
        );

    const finished = win || game.attempts >= game.maxAttempts;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_try`)
            .setLabel("🎯 Intentar")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(finished)
    );
    if (finished) gameStates.delete(gameKey);

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    return true;
}

async function roulette(interaction) {
    const gameKey = `roulette_${interaction.user.id}_${Date.now()}`;
    const embed = baseEmbedFor(interaction)
        .setTitle("🎰 Ruleta ficticia")
        .setDescription(
            "Ruleta 100% ficticia, sin dinero real.\n\n" +
            "Elige el tipo de apuesta y pulsa **Girar**."
        );
    const select = new StringSelectMenuBuilder()
        .setCustomId(`${gameKey}_select`)
        .setPlaceholder("Elige tu apuesta")
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("Rojo (x2)").setValue("red").setEmoji("🔴"),
            new StringSelectMenuOptionBuilder().setLabel("Negro (x2)").setValue("black").setEmoji("⚫"),
            new StringSelectMenuOptionBuilder().setLabel("Verde (x14)").setValue("green").setEmoji("🟢"),
            new StringSelectMenuOptionBuilder().setLabel("Número exacto (x36)").setValue("number").setEmoji("🔢")
        );
    const row = new ActionRowBuilder().addComponents(select);
    gameStates.set(gameKey, { bet: null, userId: interaction.user.id });
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleRouletteSelect(interaction) {
    const gameKey = interaction.customId.replace(/_select$/, "");
    const game = gameStates.get(gameKey);
    if (!game || game.userId !== interaction.user.id) return false;

    game.bet = interaction.values[0];
    const betName = {
        red: "🔴 Rojo (x2)",
        black: "⚫ Negro (x2)",
        green: "🟢 Verde (x14)",
        number: "🔢 Número exacto (x36)"
    }[game.bet];

    const embed = baseEmbedFor(interaction)
        .setTitle("🎰 Ruleta ficticia")
        .setDescription(`Apuesta elegida: **${betName}**\n\nPulsa **Girar** para lanzar la ruleta.`);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_spin`)
            .setLabel("🎡 Girar")
            .setStyle(ButtonStyle.Success)
    );
    await update(interaction, { embeds: [embed], components: [row] });
    return true;
}

async function handleRouletteSpin(interaction) {
    const gameKey = interaction.customId.replace(/_spin$/, "");
    const game = gameStates.get(gameKey);
    if (!game || game.userId !== interaction.user.id) return false;

    const number = rand(0, 36);
    const color = number === 0 ? "green" : number % 2 === 0 ? "black" : "red";
    const colorName = { red: "🔴", black: "⚫", green: "🟢" }[color];

    let win = false;
    let multiplier = 0;
    if (game.bet === "red" && color === "red") { win = true; multiplier = 2; }
    else if (game.bet === "black" && color === "black") { win = true; multiplier = 2; }
    else if (game.bet === "green" && color === "green") { win = true; multiplier = 14; }
    else if (game.bet === "number") { win = true; multiplier = 36; }

    const embed = baseEmbedFor(interaction)
        .setTitle("🎰 Ruleta ficticia")
        .setDescription(
            `La bola cayó en: **${number}** ${colorName}\n\n` +
            (win
                ? `🎉 **¡GANASTE!** Multiplicador **x${multiplier}** (puntos ficticios).`
                : "😔 No ganaste esta vez. ¡Puntos 100% ficticios, no pasa nada!")
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_spin`)
            .setLabel("🎡 Girar")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true)
    );
    gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [row] });
    return true;
}

function makeFighter(user, bonus = 0) {
    return {
        user,
        hp: rand(80, 120) + bonus,
        maxHp: 0,
        atk: rand(15, 30) + bonus,
        def: rand(5, 15) + bonus
    };
}

function finalizeFighter(f) {
    f.maxHp = f.hp;
    return f;
}

function dealDamage(attacker, defender) {
    const base = attacker.atk + rand(-5, 5);
    const damage = Math.max(1, base - defender.def);
    defender.hp = Math.max(0, defender.hp - damage);
    return damage;
}

function fightEmbed(title, fighters, log) {
    const e = dragonEmbed().setTitle(title).setColor(DRAGON_COLOR);
    e.addFields(fighters.map(f => ({
        name: `${f.user.username}`,
        value: `❤️ **${f.hp}**/${f.maxHp}\n${bar(f.hp, f.maxHp)}\n⚔️ Ataque: ${f.atk} | 🛡️ Defensa: ${f.def}`,
        inline: true
    })));
    if (log && log.length) {
        e.setDescription(log.slice(-6).join("\n"));
    }
    return e;
}

async function fight(interaction) {
    const u1 = getUserOption(interaction, "usuario1");
    const u2 = getUserOption(interaction, "usuario2");
    if (u1.id === u2.id) {
        return replyError(interaction, "❌ Elige dos usuarios distintos.");
    }
    const f1 = finalizeFighter(makeFighter(u1));
    const f2 = finalizeFighter(makeFighter(u2));
    const gameKey = `fight_${Date.now()}`;
    gameStates.set(gameKey, {
        type: "fight",
        fighters: [f1, f2],
        turn: 0,
        log: [],
        channelId: interaction.channelId,
        players: [u1.id, u2.id]
    });

    const embed = fightEmbed("⚔️ FIGHT", [f1, f2], ["El combate comienza..."]);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Atacar")
            .setStyle(ButtonStyle.Danger)
    );
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleFightHit(interaction) {
    const gameKey = interaction.customId.replace(/_hit$/, "");
    const game = gameStates.get(gameKey);
    if (!game || game.type !== "fight") return false;

    const [f1, f2] = game.fighters;
    if (f1.hp === 0 || f2.hp === 0) {
        return replyError(interaction, "ℹ️ El combate ya terminó.");
    }

    game.turn++;
    const attacker = game.turn % 2 === 1 ? f1 : f2;
    const defender = game.turn % 2 === 1 ? f2 : f1;
    const damage = dealDamage(attacker, defender);
    game.log.push(`**${attacker.user.username}** golpea a **${defender.user.username}** por **${damage}** de daño.`);

    let finished = false;
    if (defender.hp === 0) {
        finished = true;
        game.log.push(`💀 **${defender.user.username}** ha caído.`);
        game.log.push(`🏆 **¡${attacker.user.username} GANA!**`);
    }

    const embed = fightEmbed("⚔️ FIGHT", game.fighters, game.log);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Atacar")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(finished)
    );
    if (finished) gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [row] });
    return true;
}

async function battle(interaction) {
    const u1 = getUserOption(interaction, "usuario1");
    const u2 = getUserOption(interaction, "usuario2");
    if (u1.id === u2.id) {
        return replyError(interaction, "❌ Elige dos usuarios distintos.");
    }
    const f1 = finalizeFighter(makeFighter(u1, 10));
    const f2 = finalizeFighter(makeFighter(u2, 10));
    const gameKey = `battle_${Date.now()}`;
    gameStates.set(gameKey, {
        type: "battle",
        fighters: [f1, f2],
        turn: 0,
        log: [],
        channelId: interaction.channelId,
        players: [u1.id, u2.id]
    });

    const embed = fightEmbed("⚔️ BATALLA ÉPICA", [f1, f2], ["¡Que comience la batalla!"]);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Siguiente ronda")
            .setStyle(ButtonStyle.Primary)
    );
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleBattleHit(interaction) {
    const gameKey = interaction.customId.replace(/_hit$/, "");
    const game = gameStates.get(gameKey);
    if (!game || game.type !== "battle") return false;

    const [f1, f2] = game.fighters;
    if (f1.hp === 0 || f2.hp === 0) {
        return replyError(interaction, "ℹ️ La batalla ya terminó.");
    }

    const d1 = dealDamage(f1, f2);
    const d2 = dealDamage(f2, f1);
    game.turn++;
    game.log.push(`**Ronda ${game.turn}:** ${f1.user.username} golpea por ${d1} | ${f2.user.username} golpea por ${d2}.`);

    let finished = false;
    if (f1.hp === 0 && f2.hp === 0) {
        finished = true;
        game.log.push("💥 ¡Ambos caen a la vez! Empate épico.");
    } else if (f2.hp === 0) {
        finished = true;
        game.log.push(`🏆 **¡${f1.user.username} GANA LA BATALLA!**`);
    } else if (f1.hp === 0) {
        finished = true;
        game.log.push(`🏆 **¡${f2.user.username} GANA LA BATALLA!**`);
    }

    const embed = fightEmbed("⚔️ BATALLA ÉPICA", [f1, f2], game.log);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Siguiente ronda")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(finished)
    );
    if (finished) gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [row] });
    return true;
}

async function duelo(interaction) {
    const u1 = getUserOption(interaction, "usuario1");
    const u2 = getUserOption(interaction, "usuario2");
    if (u1.id === u2.id) {
        return replyError(interaction, "❌ Elige dos usuarios distintos.");
    }
    const f1 = finalizeFighter(makeFighter(u1));
    const f2 = finalizeFighter(makeFighter(u2));
    const gameKey = `duelo_${Date.now()}`;
    gameStates.set(gameKey, {
        type: "duelo",
        fighters: [f1, f2],
        turn: 0,
        log: [],
        channelId: interaction.channelId,
        players: [u1.id, u2.id]
    });

    const embed = dragonEmbed()
        .setTitle("🤠 DUELO AL AMANECER")
        .setColor(GOLD_COLOR)
        .setDescription(
            `${f1.user.username} y ${f2.user.username} se enfrentan cara a cara.\n\n` +
            `**${f1.user.username}:** ❤️ ${f1.hp} | ⚔️ ${f1.atk} | 🛡️ ${f1.def}\n` +
            `**${f2.user.username}:** ❤️ ${f2.hp} | ⚔️ ${f2.atk} | 🛡️ ${f2.def}\n\n` +
            "Pulsa **Disparar** para que avance el duelo."
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("🔫 Disparar")
            .setStyle(ButtonStyle.Danger)
    );
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleDueloHit(interaction) {
    const gameKey = interaction.customId.replace(/_hit$/, "");
    const game = gameStates.get(gameKey);
    if (!game || game.type !== "duelo") return false;

    const [f1, f2] = game.fighters;
    if (f1.hp === 0 || f2.hp === 0) {
        return replyError(interaction, "ℹ️ El duelo ya terminó.");
    }

    const shooter = Math.random() < 0.5 ? f1 : f2;
    const victim = shooter === f1 ? f2 : f1;
    const damage = rand(15, 35);
    victim.hp = Math.max(0, victim.hp - damage);
    game.turn++;
    game.log.push(`🔫 **${shooter.user.username}** dispara a **${victim.user.username}** por **${damage}**.`);

    let finished = false;
    if (victim.hp === 0) {
        finished = true;
        game.log.push(`🏆 **¡${shooter.user.username} gana el duelo!**`);
    }

    const embed = dragonEmbed()
        .setTitle("🤠 DUELO AL AMANECER")
        .setColor(GOLD_COLOR)
        .setDescription(
            `**${f1.user.username}:** ❤️ ${f1.hp} | ⚔️ ${f1.atk} | 🛡️ ${f1.def}\n` +
            `**${f2.user.username}:** ❤️ ${f2.hp} | ⚔️ ${f2.atk} | 🛡️ ${f2.def}\n\n` +
            game.log.slice(-4).join("\n")
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("🔫 Disparar")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(finished)
    );
    if (finished) gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [row] });
    return true;
}

async function boss(interaction) {
    const bossName = interaction.options.getString("jefe") || "Dragón Ancestral";
    const bossHp = rand(200, 400);
    const gameKey = `boss_${Date.now()}`;
    gameStates.set(gameKey, {
        type: "boss",
        name: bossName,
        hp: bossHp,
        maxHp: bossHp,
        attacks: 0,
        damage: new Map(),
        players: new Set(),
        channelId: interaction.channelId,
        ownerId: interaction.user.id
    });

    const embed = dragonEmbed()
        .setTitle(`👹 BOSS: ${bossName}`)
        .setColor(RED_COLOR)
        .setDescription(
            `❤️ **${bossHp}**/${bossHp}\n${bar(bossHp, bossHp)}\n\n` +
            `Varios usuarios pueden atacar. El que más daño cause será el MVP.`
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Atacar")
            .setStyle(ButtonStyle.Danger)
    );
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleBossHit(interaction) {
    const gameKey = interaction.customId.replace(/_hit$/, "");
    const game = gameStates.get(gameKey);
    if (!game || game.type !== "boss") return false;
    if (game.hp === 0) {
        return replyError(interaction, "ℹ️ El boss ya fue derrotado.");
    }

    const damage = rand(10, 40);
    game.hp = Math.max(0, game.hp - damage);
    game.attacks++;
    game.players.add(interaction.user.id);
    game.damage.set(interaction.user.id, (game.damage.get(interaction.user.id) || 0) + damage);
    game.log = game.log || [];
    game.log.push(`**${interaction.user.username}** golpea al boss por **${damage}**.`);

    let finished = false;
    let description = `❤️ **${game.hp}**/${game.maxHp}\n${bar(game.hp, game.maxHp)}\n\n`;
    if (game.hp === 0) {
        finished = true;
        const mvpId = [...game.damage.entries()].sort((a, b) => b[1] - a[1])[0][0];
        description += `💀 **${game.name}** ha sido derrotado tras **${game.attacks}** ataques.\n\n` +
            `🏆 **MVP:** <@${mvpId}> con **${game.damage.get(mvpId)}** de daño.`;
    } else {
        description += `El boss contraataca con un rugido... ¡sigue atacando!`;
    }
    description += `\n\n${game.log.slice(-3).join("\n")}`;

    const embed = dragonEmbed()
        .setTitle(`👹 BOSS: ${game.name}`)
        .setColor(finished ? GREEN_COLOR : RED_COLOR)
        .setDescription(description);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Atacar")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(finished)
    );
    if (finished) gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [row] });
    return true;
}

async function minigame(interaction) {
    const embed = baseEmbedFor(interaction)
        .setTitle("🎮 Menú de minijuegos")
        .setDescription("Elige un minijuego del menú desplegable 👇");
    const select = new StringSelectMenuBuilder()
        .setCustomId(`minigame_${interaction.user.id}_${Date.now()}_select`)
        .setPlaceholder("Selecciona un minijuego")
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("Piedra, papel o tijera").setValue("rps").setEmoji("✂️"),
            new StringSelectMenuOptionBuilder().setLabel("Trivia").setValue("trivia").setEmoji("🧠"),
            new StringSelectMenuOptionBuilder().setLabel("Cuestionario").setValue("quiz").setEmoji("📝"),
            new StringSelectMenuOptionBuilder().setLabel("Adivina el número").setValue("guess").setEmoji("🎯"),
            new StringSelectMenuOptionBuilder().setLabel("Ruleta").setValue("roulette").setEmoji("🎰"),
            new StringSelectMenuOptionBuilder().setLabel("Combate").setValue("battle").setEmoji("⚔️")
        );
    const row = new ActionRowBuilder().addComponents(select);
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleMinigameSelect(interaction) {
    if (!interaction.customId.startsWith("minigame_") || !interaction.customId.endsWith("_select")) return false;
    const gameId = interaction.values[0];
    const options = {
        rps: interaction.options?.getString,
        trivia: null,
        quiz: null,
        guess: null,
        roulette: null,
        battle: null
    };
    void options;

    if (gameId === "rps") {
        const sub = interaction.client;
        void sub;
        const choices = [
            { id: "piedra", emoji: "🪨", beats: "tijera" },
            { id: "papel", emoji: "📄", beats: "piedra" },
            { id: "tijera", emoji: "✂️", beats: "papel" }
        ];
        const gameKey = `rps_${interaction.user.id}_${Date.now()}`;
        const embed = baseEmbedFor(interaction)
            .setTitle("✂️ Piedra, papel o tijera")
            .setDescription("Elige tu jugada 👇");
        const row = new ActionRowBuilder().addComponents(
            choices.map(c =>
                new ButtonBuilder()
                    .setCustomId(`${gameKey}_${c.id}`)
                    .setLabel(c.id[0].toUpperCase() + c.id.slice(1))
                    .setEmoji(c.emoji)
                    .setStyle(ButtonStyle.Primary)
            )
        );
        gameStates.set(gameKey, { choices, userId: interaction.user.id });
        await update(interaction, { embeds: [embed], components: [row] });
        return true;
    }

    if (gameId === "trivia") {
        await trivia(interaction);
        return true;
    }

    if (gameId === "quiz") {
        await quiz(interaction);
        return true;
    }

    if (gameId === "guess") {
        await guess(interaction);
        return true;
    }

    if (gameId === "roulette") {
        await roulette(interaction);
        return true;
    }

    if (gameId === "battle") {
        const botUser = interaction.client.user;
        const f1 = finalizeFighter(makeFighter(interaction.user, 10));
        const f2 = finalizeFighter(makeFighter(botUser, 10));
        const gameKey = `battle_${Date.now()}`;
        gameStates.set(gameKey, {
            type: "battle",
            fighters: [f1, f2],
            turn: 0,
            log: [],
            channelId: interaction.channelId,
            players: [interaction.user.id, botUser.id]
        });
        const embed = fightEmbed("⚔️ BATALLA ÉPICA", [f1, f2], ["¡Que comience la batalla!"]);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${gameKey}_hit`)
                .setLabel("⚔️ Siguiente ronda")
                .setStyle(ButtonStyle.Primary)
        );
        await update(interaction, { embeds: [embed], components: [row] });
        return true;
    }

    return false;
}

async function challenge(interaction) {
    const embed = baseEmbedFor(interaction)
        .setTitle("🏆 Desafío")
        .setDescription(pick(CHALLENGES));
    await reply(interaction, { embeds: [embed] });
}

async function randomAction(interaction) {
    const embed = baseEmbedFor(interaction)
        .setTitle("🎲 Acción aleatoria")
        .setDescription(pick(RANDOM_ACTIONS));
    await reply(interaction, { embeds: [embed] });
}

async function dragrace(interaction) {
    const participants = [];
    for (let i = 1; i <= 4; i++) {
        const u = interaction.options.getUser(`usuario${i}`);
        if (u && !participants.some(p => p.id === u.id)) participants.push(u);
    }
    if (participants.length < 2) {
        return replyError(interaction, "❌ Necesitas al menos 2 participantes.");
    }

    const racers = participants.map(u => ({
        user: u,
        progress: 0,
        finishTime: null,
        color: ["🔴", "🟠", "🟢", "🔵"][participants.indexOf(u) % 4]
    }));

    const gameKey = `dragrace_${Date.now()}`;
    const total = 100;
    const step = 12;

    function raceEmbed() {
        const lines = racers.map(r =>
            `${r.color} **${r.user.username}:** ${"🏁".padEnd(0)}${"▬".repeat(Math.floor(r.progress / step))}🏎️`
        );
        return dragonEmbed()
            .setTitle("🏁 DRAG RACE")
            .setColor(GOLD_COLOR)
            .setDescription(lines.join("\n\n"));
    }

    gameStates.set(gameKey, { racers, total, step, finished: false });
    const embed = raceEmbed();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_go`)
            .setLabel("🏁 ¡Adelante!")
            .setStyle(ButtonStyle.Success)
    );
    await reply(interaction, { embeds: [embed], components: [row] });

    async function advance() {
        const g = gameStates.get(gameKey);
        if (!g || g.finished) return;
        for (const r of g.racers) {
            if (r.finishTime !== null) continue;
            r.progress = Math.min(g.total, r.progress + rand(5, g.step + 5));
            if (r.progress >= g.total) r.finishTime = g.racers.filter(x => x.finishTime !== null).length + 1;
        }
        const allDone = g.racers.every(r => r.finishTime !== null);
        if (allDone) g.finished = true;

        const lines = g.racers.map(r => {
            const pos = r.finishTime ? `**${r.finishTime}º**` : "";
            return `${r.color} **${r.user.username}:** ${"▬".repeat(Math.floor(r.progress / g.step))}🏎️ ${pos}`;
        });
        const embed = dragonEmbed()
            .setTitle("🏁 DRAG RACE")
            .setColor(GOLD_COLOR)
            .setDescription(lines.join("\n\n"));

        if (g.finished) {
            const winner = g.racers.find(r => r.finishTime === 1);
            embed.setDescription(
                lines.join("\n\n") +
                `\n\n🏆 **¡${winner.user.username} GANA LA CARRERA!**`
            );
            gameStates.delete(gameKey);
            await editReply(interaction, {
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`${gameKey}_go`)
                        .setLabel("🏁 ¡Adelante!")
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true)
                )]
            });
            return;
        }

        await editReply(interaction, {
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`${gameKey}_go`)
                    .setLabel("🏁 ¡Adelante!")
                    .setStyle(ButtonStyle.Success)
            )]
        });
    }

    async function handleGo(interaction) {
        const g = gameStates.get(gameKey);
        if (!g || g.finished) return false;
        await interaction.deferUpdate();
        await advance();
        return true;
    }

    gameStates.set(`${gameKey}_handler`, handleGo);
    return;
}

async function handleDragraceButton(interaction) {
    const gameKey = interaction.customId.replace(/_go$/, "");
    const handler = gameStates.get(`${gameKey}_handler`);
    if (typeof handler === "function") {
        return handler(interaction);
    }
    return false;
}

async function treasure(interaction) {
    const secret = rand(1, 9);
    const gameKey = `treasure_${interaction.user.id}_${Date.now()}`;
    gameStates.set(gameKey, { secret, found: false, userId: interaction.user.id });

    const embed = baseEmbedFor(interaction)
        .setTitle("🗺️ Búsqueda del tesoro")
        .setDescription(
            "Un tesoro está escondido en una de las **9 casillas**.\n\n" +
            "Elige casillas con los botones y encuentra el **💎 tesoro**."
        );
    const row = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
    ].map(group =>
        new ActionRowBuilder().addComponents(
            group.map(n =>
                new ButtonBuilder()
                    .setCustomId(`${gameKey}_${n}`)
                    .setLabel(`${n}`)
                    .setStyle(ButtonStyle.Secondary)
            )
        )
    );
    await reply(interaction, { embeds: [embed], components: row });
}

async function handleTreasureButton(interaction) {
    const match = /^(treasure_\d+_\d+)_(\d)$/.exec(interaction.customId);
    if (!match) return false;
    const gameKey = match[1];
    const cell = Number(match[2]);
    const game = gameStates.get(gameKey);
    if (!game || game.userId !== interaction.user.id) return false;

    if (game.found) return false;

    let result;
    if (cell === game.secret) {
        game.found = true;
        result = "🎉 **¡ENCONTRASTE EL TESORO!** 💎";
    } else {
        const dist = Math.abs(cell - game.secret);
        result = dist <= 1 ? "🔥 **¡Muy cerca!**" :
            dist <= 2 ? "😐 Tibio..." :
            "❄️ Frío, frío.";
    }

    const grid = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
        if (n === game.secret && game.found) return "💎";
        if (n === cell) return "❌";
        return "▪️";
    });

    const embed = baseEmbedFor(interaction)
        .setTitle("🗺️ Búsqueda del tesoro")
        .setDescription(
            `\`${grid.slice(0, 3).join(" ")}\`\n` +
            `\`${grid.slice(3, 6).join(" ")}\`\n` +
            `\`${grid.slice(6, 9).join(" ")}\`\n\n` +
            result
        );

    const rows = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
    ].map(group =>
        new ActionRowBuilder().addComponents(
            group.map(n =>
                new ButtonBuilder()
                    .setCustomId(`${gameKey}_${n}`)
                    .setLabel(`${n}`)
                    .setStyle(n === game.secret && game.found ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(game.found)
            )
        )
    );

    if (game.found) gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: rows });
    return true;
}

async function casino(interaction) {
    const embed = baseEmbedFor(interaction)
        .setTitle("🎰 CASINO FICTICIO")
        .setDescription(
            "Minijuegos de casino con **puntos ficticios** del bot.\n\n" +
            "⚠️ **No hay dinero real. No hay apuestas reales.** Solo diversión.\n\n" +
            "Elige un juego 👇"
        );
    const select = new StringSelectMenuBuilder()
        .setCustomId(`casino_${interaction.user.id}_${Date.now()}_select`)
        .setPlaceholder("Elige un minijuego de casino")
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("Ruleta ficticia").setValue("roulette").setEmoji("🎡"),
            new StringSelectMenuOptionBuilder().setLabel("Dados ficticios").setValue("dice").setEmoji("🎲"),
            new StringSelectMenuOptionBuilder().setLabel("Doble o nada").setValue("double").setEmoji("💎")
        );
    const row = new ActionRowBuilder().addComponents(select);
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleCasinoSelect(interaction) {
    if (!interaction.customId.startsWith("casino_") || !interaction.customId.endsWith("_select")) return false;
    const game = interaction.values[0];

    if (game === "roulette") {
        const gameKey = `roulette_${interaction.user.id}_${Date.now()}`;
        const embed = baseEmbedFor(interaction)
            .setTitle("🎰 Ruleta ficticia")
            .setDescription("Elige el tipo de apuesta y pulsa **Girar**. (100% ficticio)")
        const select = new StringSelectMenuBuilder()
            .setCustomId(`${gameKey}_select`)
            .setPlaceholder("Elige tu apuesta")
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel("Rojo (x2)").setValue("red").setEmoji("🔴"),
                new StringSelectMenuOptionBuilder().setLabel("Negro (x2)").setValue("black").setEmoji("⚫"),
                new StringSelectMenuOptionBuilder().setLabel("Verde (x14)").setValue("green").setEmoji("🟢"),
                new StringSelectMenuOptionBuilder().setLabel("Número exacto (x36)").setValue("number").setEmoji("🔢")
            );
        const row = new ActionRowBuilder().addComponents(select);
        gameStates.set(gameKey, { bet: null, userId: interaction.user.id });
        await update(interaction, { embeds: [embed], components: [row] });
        return true;
    }

    if (game === "dice") {
        const embed = baseEmbedFor(interaction)
            .setTitle("🎲 Dados ficticios")
            .setDescription("Apostemos **100 puntos ficticios** al doble o al triple... ¡a la suerte!")
            .setColor(GOLD_COLOR);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`casino_dice_${interaction.user.id}_${Date.now()}_roll`)
                .setLabel("🎲 Lanzar dados")
                .setStyle(ButtonStyle.Primary)
        );
        gameStates.set(`casino_dice_${interaction.user.id}`, { rolled: false, userId: interaction.user.id });
        await update(interaction, { embeds: [embed], components: [row] });
        return true;
    }

    if (game === "double") {
        const embed = baseEmbedFor(interaction)
            .setTitle("💎 Doble o nada")
            .setDescription(
                "Tienes **100 puntos ficticios**.\n\n" +
                "Adivina si el dado será **par** o **impar**. Si aciertas, doblas. Si fallas, pierdes. (Siempre ficticio)"
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`casino_double_${interaction.user.id}_${Date.now()}_par`).setLabel("🟢 Par").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`casino_double_${interaction.user.id}_${Date.now()}_impar`).setLabel("🟠 Impar").setStyle(ButtonStyle.Primary)
        );
        gameStates.set(`casino_double_${interaction.user.id}`, { picked: false, userId: interaction.user.id });
        await update(interaction, { embeds: [embed], components: [row] });
        return true;
    }

    return false;
}

async function handleCasinoButtons(interaction) {
    if (interaction.customId.startsWith("casino_dice_")) {
        const gameKey = `casino_dice_${interaction.user.id}`;
        const game = gameStates.get(gameKey);
        if (!game || game.userId !== interaction.user.id) return false;

        const d1 = rand(1, 6);
        const d2 = rand(1, 6);
        const sum = d1 + d2;
        const result = sum >= 8 ? "¡Gran tirada! 🎉" : sum >= 5 ? "Tirada decente. 👍" : "Mala suerte. 😅";
        const embed = baseEmbedFor(interaction)
            .setTitle("🎲 Dados ficticios")
            .setDescription(
                `Los dados cayeron en **${d1}** y **${d2}** = **${sum}**.\n\n` +
                `${result}\n\n⚠️ Todo ficticio, sin dinero real.`
            )
            .setColor(GOLD_COLOR);
        gameStates.delete(gameKey);
        await update(interaction, {
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(interaction.customId)
                    .setLabel("🎲 Lanzar dados")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            )]
        });
        return true;
    }

    if (interaction.customId.startsWith("casino_double_")) {
        const gameKey = `casino_double_${interaction.user.id}`;
        const game = gameStates.get(gameKey);
        if (!game || game.userId !== interaction.user.id) return false;

        const isPar = interaction.customId.includes("_par");
        const roll = rand(1, 6);
        const win = (roll % 2 === 0) === isPar;
        const embed = baseEmbedFor(interaction)
            .setTitle("💎 Doble o nada")
            .setDescription(
                `El dado cayó en **${roll}** (${roll % 2 === 0 ? "par" : "impar"}).\n\n` +
                (win
                    ? "🎉 **¡Doblaste tus 100 puntos ficticios!** Ahora tienes 200 (imaginarios)."
                    : "😔 Perdiste tus 100 puntos ficticios. Pero ¡todo es imaginario!")
            )
            .setColor(win ? GREEN_COLOR : RED_COLOR);
        gameStates.delete(gameKey);
        await update(interaction, {
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("casino_done").setLabel("✅ Fin de la partida").setStyle(ButtonStyle.Secondary).setDisabled(true)
            )]
        });
        return true;
    }

    return false;
}

async function pokemon(interaction) {
    const target = getUserOption(interaction, "usuario");
    const beast1 = pick(POKEMON_LIKE);
    const beast2 = pick(POKEMON_LIKE);
    const f1 = finalizeFighter({
        user: interaction.user,
        hp: beast1.hp + rand(-5, 5),
        atk: beast1.atk + rand(-3, 3),
        def: beast1.def + rand(-2, 2)
    });
    const f2 = finalizeFighter({
        user: target,
        hp: beast2.hp + rand(-5, 5),
        atk: beast2.atk + rand(-3, 3),
        def: beast2.def + rand(-2, 2)
    });

    const gameKey = `pokemon_${Date.now()}`;
    gameStates.set(gameKey, {
        type: "pokemon",
        fighters: [f1, f2],
        beasts: [beast1, beast2],
        turn: 0,
        log: [],
        channelId: interaction.channelId,
        players: [interaction.user.id, target.id]
    });

    const embed = dragonEmbed()
        .setTitle("⚡ Batalla de criaturas")
        .setDescription(
            `${beast1.emoji} **${beast1.name}** (${interaction.user}) vs ${beast2.emoji} **${beast2.name}** (${target})\n\n` +
            `**${beast1.name}:** ❤️ ${f1.hp} | ⚔️ ${f1.atk} | 🛡️ ${f1.def}\n` +
            `**${beast2.name}:** ❤️ ${f2.hp} | ⚔️ ${f2.atk} | 🛡️ ${f2.def}\n\n` +
            "Pulsa **Atacar** para avanzar la batalla."
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Atacar")
            .setStyle(ButtonStyle.Primary)
    );
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handlePokemonHit(interaction) {
    const gameKey = interaction.customId.replace(/_hit$/, "");
    const game = gameStates.get(gameKey);
    if (!game || game.type !== "pokemon") return false;

    const [f1, f2] = game.fighters;
    const [b1, b2] = game.beasts;
    if (f1.hp === 0 || f2.hp === 0) {
        return replyError(interaction, "ℹ️ La batalla ya terminó.");
    }

    game.turn++;
    const attacker = game.turn % 2 === 1 ? f1 : f2;
    const defender = game.turn % 2 === 1 ? f2 : f1;
    const beast = game.turn % 2 === 1 ? b1 : b2;
    const damage = dealDamage(attacker, defender);
    game.log.push(`${beast.emoji} **${beast.name}** ataca por **${damage}**.`);

    let finished = false;
    if (defender.hp === 0) {
        finished = true;
        game.log.push(`💫 **${game.turn % 2 === 1 ? b2.name : b1.name}** se debilita.`);
        game.log.push(`🏆 **¡${attacker.user.username} gana la batalla!**`);
    }

    const embed = dragonEmbed()
        .setTitle("⚡ Batalla de criaturas")
        .setDescription(
            `${b1.emoji} **${b1.name}:** ❤️ ${f1.hp}\n` +
            `${b2.emoji} **${b2.name}:** ❤️ ${f2.hp}\n\n` +
            game.log.slice(-5).join("\n")
        )
        .setColor(finished ? GREEN_COLOR : DRAGON_COLOR);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Atacar")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(finished)
    );
    if (finished) gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [row] });
    return true;
}

async function dragonfight(interaction) {
    const target = getUserOption(interaction, "usuario");
    const userFighter = finalizeFighter(makeFighter(interaction.user, 15));
    const dragon = finalizeFighter({
        user: { username: "Dragón Salvaje" },
        hp: rand(120, 180),
        atk: rand(25, 40),
        def: rand(10, 20)
    });

    const gameKey = `dragonfight_${Date.now()}`;
    gameStates.set(gameKey, {
        type: "dragonfight",
        fighters: [userFighter, dragon],
        turn: 0,
        log: [],
        channelId: interaction.channelId,
        players: [interaction.user.id],
        dragonAttacks: DRAGON_ATTACKS
    });

    const embed = dragonEmbed()
        .setTitle("🐉 BATALLA DE DRAGONES")
        .setDescription(
            `${target || interaction.user}, un **Dragón Salvaje** bloquea tu camino.\n\n` +
            `**${interaction.user.username}:** ❤️ ${userFighter.hp} | ⚔️ ${userFighter.atk} | 🛡️ ${userFighter.def}\n` +
            `**🐉 Dragón Salvaje:** ❤️ ${dragon.hp} | ⚔️ ${dragon.atk} | 🛡️ ${dragon.def}\n\n` +
            "Pulsa **Atacar** para luchar. El dragón usará sus habilidades."
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Atacar")
            .setStyle(ButtonStyle.Danger)
    );
    await reply(interaction, { embeds: [embed], components: [row] });
}

async function handleDragonfightHit(interaction) {
    const gameKey = interaction.customId.replace(/_hit$/, "");
    const game = gameStates.get(gameKey);
    if (!game || game.type !== "dragonfight") return false;

    const [userFighter, dragon] = game.fighters;
    if (userFighter.hp === 0 || dragon.hp === 0) {
        return replyError(interaction, "ℹ️ La batalla ya terminó.");
    }

    game.turn++;

    const userDamage = dealDamage(userFighter, dragon);
    game.log.push(`⚔️ **${interaction.user.username}** golpea al dragón por **${userDamage}**.`);

    let finished = false;
    if (dragon.hp === 0) {
        finished = true;
        game.log.push(`🏆 **¡VENCISTE AL DRAGÓN SALVAJE!** 🐉💀`);
    } else {
        const attack = pick(DRAGON_ATTACKS);
        const dmg = rand(attack.dmg[0], attack.dmg[1]);
        userFighter.hp = Math.max(0, userFighter.hp - dmg);
        game.log.push(`${attack.emoji} **${attack.name}** del dragón te golpea por **${dmg}**.`);
        if (userFighter.hp === 0) {
            finished = true;
            game.log.push(`💀 **Has caído.** El dragón gana esta vez...`);
        }
    }

    const embed = dragonEmbed()
        .setTitle("🐉 BATALLA DE DRAGONES")
        .setDescription(
            `**${interaction.user.username}:** ❤️ ${userFighter.hp} | ${bar(userFighter.hp, userFighter.maxHp)}\n` +
            `**🐉 Dragón Salvaje:** ❤️ ${dragon.hp} | ${bar(dragon.hp, dragon.maxHp)}\n\n` +
            game.log.slice(-4).join("\n")
        )
        .setColor(finished ? (dragon.hp === 0 ? GREEN_COLOR : RED_COLOR) : DRAGON_COLOR);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${gameKey}_hit`)
            .setLabel("⚔️ Atacar")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(finished)
    );
    if (finished) gameStates.delete(gameKey);
    await update(interaction, { embeds: [embed], components: [row] });
    return true;
}

async function fortune(interaction) {
    const embed = baseEmbedFor(interaction)
        .setTitle("🔮 Fortuna")
        .setDescription(pick(FORTUNES));
    await reply(interaction, { embeds: [embed] });
}

async function magicball(interaction) {
    const question = interaction.options.getString("pregunta");
    const embed = baseEmbedFor(interaction)
        .setTitle("🔮 Bola mágica")
        .setDescription(`**Pregunta:** ${question}\n\n✨ **Respuesta:** ${pick(BALL_ANSWERS)}`);
    await reply(interaction, { embeds: [embed] });
}

async function compliment(interaction) {
    const target = getUserOption(interaction, "usuario");
    const embed = baseEmbedFor(interaction)
        .setTitle("💝 Cumplido")
        .setDescription(`${target}, ${pick(COMPLIMENTS)}`)
        .setColor(GREEN_COLOR);
    await reply(interaction, { embeds: [embed] });
}

const COMMANDS = {
    "8ball": eightBall,
    coinflip,
    dice,
    ship,
    roast,
    joke,
    meme,
    avatar,
    hug,
    slap,
    pat,
    kiss,
    rate,
    choose,
    rps,
    trivia,
    quiz,
    guess,
    roulette,
    fight,
    battle,
    fortune,
    magicball,
    compliment,
    duelo,
    boss,
    minigame,
    challenge,
    random: randomAction,
    dragrace,
    treasure,
    casino,
    pokemon,
    dragonfight
};

async function handleButton(interaction) {
    const customId = interaction.customId || "";

    if (await handleRpsButton(interaction)) return true;
    if (await handleTriviaButton(interaction)) return true;
    if (await handleQuizButton(interaction)) return true;
    if (await handleGuessTry(interaction)) return true;
    if (await handleRouletteSpin(interaction)) return true;
    if (await handleFightHit(interaction)) return true;
    if (await handleBattleHit(interaction)) return true;
    if (await handleDueloHit(interaction)) return true;
    if (await handleBossHit(interaction)) return true;
    if (await handleDragraceButton(interaction)) return true;
    if (await handleTreasureButton(interaction)) return true;
    if (await handleCasinoButtons(interaction)) return true;
    if (await handlePokemonHit(interaction)) return true;
    if (await handleDragonfightHit(interaction)) return true;

    void customId;
    return false;
}

async function handleSelect(interaction) {
    if (await handleRouletteSelect(interaction)) return true;
    if (await handleMinigameSelect(interaction)) return true;
    if (await handleCasinoSelect(interaction)) return true;
    return false;
}

async function handleFunInteraction(interaction, config, saveConfig) {
    if (interaction.isCommand()) {
        const handler = COMMANDS[interaction.commandName];
        if (handler) {
            try {
                await handler(interaction);
            } catch (error) {
                console.error(`[Fun] Error en /${interaction.commandName}:`, error);
                if (!interaction.replied && !interaction.deferred) {
                    await replyError(interaction, "❌ Ocurrió un error inesperado. Inténtalo de nuevo.");
                }
            }
            return true;
        }
        return false;
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId?.startsWith("guess_")) {
            if (await handleGuessModal(interaction)) return true;
        }
        return false;
    }

    if (interaction.isStringSelectMenu()) {
        return handleSelect(interaction);
    }

    if (interaction.isButton()) {
        return handleButton(interaction);
    }

    return false;
}

module.exports = {
    handleFunInteraction
};
