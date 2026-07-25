const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("hola")
        .setDescription("Saluda al bot")
        .toJSON()
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log("Registrando comandos...");

        await rest.put(
            Routes.applicationCommands("1529523873781911662"),
            {
                body: commands
            }
        );

        console.log("✅ Comando registrado correctamente.");
    } catch (error) {
        console.error(error);
    }
})();