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
    TextInputStyle
} = require("discord.js");
const fs = require("fs");
const express = require("express");
const config = require("./config.json");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once("clientReady", () => {
    console.log(`Bot conectado como ${client.user.tag}`);
});


client.on("guildMemberAdd", member => {
console.log(`${member.user.tag} entró al servidor.`);
    const datos = config[member.guild.id];

    if (!datos) return;

    const canal = member.guild.channels.cache.get(
        datos.welcomeChannel
    );

if (!canal) {
    console.log("❌ No encontré el canal de bienvenida.");
    return;
}

   console.log("✅ Canal encontrado:", canal.name);
   
    const bienvenida = new EmbedBuilder()
        .setColor("#8A2BE2")
        .setTitle("🐉 ¡Bienvenido a DRAGONS!")
        .setDescription(
            `Hola ${member}, nos alegra tenerte aquí 🔥\n\n` +
            `🌎 Servidor: **${member.guild.name}**\n` +
            `👥 Miembros: **${member.guild.memberCount}**\n\n` +
            `Lee las reglas y disfruta tu estadía 🐉`
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({
            text: "DRAGONS | Comunidad oficial"
        })
        .setTimestamp();

    canal.send({
    content: `${member}`,
    embeds: [bienvenida]
});

});

client.on("messageCreate", async message => {
    // CONFIGURAR PANEL DE TICKETS
if (message.content.startsWith("!setticket")) {

    if (!message.member.permissions.has("Administrator")) {
        return message.reply("❌ Solo administradores pueden usar este comando.");
    }

    const canal = message.mentions.channels.first();

    if (!canal) {
        return message.reply("❌ Ejemplo: `!setticket #soporte`");
    }
const embed = new EmbedBuilder()
    .setColor("#8A2BE2")
    .setTitle("🐉 DRAGONS | SOPORTE")
    .setDescription(
        "¿Necesitas ayuda?\n\n" +
        "Presiona el botón para crear un ticket 🎫\n\n" +
        "Un miembro del staff te ayudará lo antes posible."
    )
    .setFooter({
        text: "DRAGONS | Sistema de Tickets"
    });


const boton = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
            .setCustomId("crear_ticket")
            .setLabel("🎫 Crear Ticket")
            .setStyle(ButtonStyle.Primary)
    );


canal.send({
    embeds: [embed],
    components: [boton]
});


message.reply("✅ Panel de tickets creado correctamente.");

    config[message.guild.id].ticketChannel = canal.id;


    fs.writeFileSync(
        "./config.json",
        JSON.stringify(config, null, 4)
    );


    message.reply(`✅ Canal de tickets configurado: ${canal}`);
}
// CONFIGURAR CANAL DE BIENVENIDA
if (message.content.startsWith("!setwelcome")) {

    if (!message.member.permissions.has("Administrator")) {
        return message.reply("❌ Solo los administradores pueden usar este comando.");
    }

    const canal = message.mentions.channels.first();

    if (!canal) {
        return message.reply("❌ Menciona un canal. Ejemplo: `!setwelcome #bienvenidas`");
    }


    config[message.guild.id] = {
        welcomeChannel: canal.id
    };


    fs.writeFileSync(
        "./config.json",
        JSON.stringify(config, null, 4)
    );


    message.reply(`✅ Canal de bienvenida configurado: ${canal}`);
}
    if (message.author.bot) return;


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

    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === "hola") {

            return interaction.reply("¡Hola! Soy DRAGONS | BOT XDD 🐉");

        }

if (interaction.commandName === "bienvenida") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
            content: "❌ Solo los administradores pueden usar este comando.",
            ephemeral: true
        });
    }

    const canal = interaction.options.getChannel("canal");

    if (!config[interaction.guild.id]) {
        config[interaction.guild.id] = {};
    }

    config[interaction.guild.id].welcomeChannel = canal.id;

    fs.writeFileSync(
        "./config.json",
        JSON.stringify(config, null, 4)
    );

    return interaction.reply({
        content: `✅ Canal de bienvenida configurado: ${canal}`
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

} // Cierra el if (interaction.commandName === "embed")

} // ← AGREGA ESTA LLAVE NUEVA

if (interaction.isModalSubmit()) {

console.log("📨 Modal recibido");

    if (interaction.customId === "modal_embed") {

        console.log("✅ Entró al modal_embed");

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

        return interaction.reply({
            content: "✅ Embed enviado correctamente.",
            ephemeral: true
        });

    }

}
    if (!interaction.isButton()) return;

    if (interaction.customId === "crear_ticket") {

        const canalExistente = interaction.guild.channels.cache.find(
            canal => canal.name === `ticket-${interaction.user.username}`
        );

        if (canalExistente) {
            return interaction.reply({
                content: "❌ Ya tienes un ticket abierto.",
                ephemeral: true
            });
        }

        const ticket = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,

            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages
                    ]
                }
            ]
        });

        const embed = new EmbedBuilder()
            .setColor("#8A2BE2")
            .setTitle("🎫 Ticket creado")
            .setDescription(
                `Hola ${interaction.user} 👋\n\n` +
                "Un miembro del staff te ayudará pronto.\n\n" +
                "Cuando termines puedes cerrar el ticket 🔒"
            );

        const botonCerrar = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("cerrar_ticket")
                    .setLabel("🔒 Cerrar Ticket")
                    .setStyle(ButtonStyle.Danger)
            );

        await ticket.send({
            content: `${interaction.user}`,
            embeds: [embed],
            components: [botonCerrar]
        });

        await interaction.reply({
            content: `✅ Ticket creado: ${ticket}`,
            ephemeral: true
        });
    }
if (interaction.customId === "cerrar_ticket") {

    await interaction.reply({
        content: "🔒 Cerrando ticket en 5 segundos...",
        ephemeral: true
    });

    setTimeout(async () => {
        await interaction.channel.delete();
    }, 5000);

     }

});

client.login(process.env.TOKEN);

// ===============================
// API para la página web
// ===============================

const express = require("express");
const app = express();

app.get("/", (req, res) => {
    res.send("DragonBot API funcionando");
});

app.get("/members", (req, res) => {
    const guild = client.guilds.cache.get("1476978589575413813");

    if (!guild) {
        return res.json({ members: 0 });
    }

    res.json({
        members: guild.memberCount
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("API iniciada en el puerto " + PORT);
});