const {
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType
} = require("discord.js");

const commands = [
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
        ),

].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log("Registrando comandos...");

await rest.put(
    Routes.applicationGuildCommands(
        "1529523873781911662",
        "1476978589575413813"
    ),
    {
        body: commands
    }
);

        console.log("✅ Comandos registrados.");
    } catch (error) {
        console.error(error);
    }
})();