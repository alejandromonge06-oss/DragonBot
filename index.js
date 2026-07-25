const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChannelType,
    PermissionsBitField
} = require("discord.js");
const fs = require("fs");
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

    const datos = config[member.guild.id];

    if (!datos) return;

    const canal = member.guild.channels.cache.get(
        datos.welcomeChannel
    );

    if (!canal) return;

   
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

    canal.send({ embeds: [bienvenida] });

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
    if (message.content === "!hola") {
        message.reply("¡Hola! Soy un bot de Discord 🤖");
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

client.login(process.env.TOKEN)