require("dotenv").config();

const { Client, GatewayIntentBits, Partials, EmbedBuilder, Colors, GuildMember, PartialGuildMember, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const noblox = require("noblox"); // See client.once('ready') block
//const bruh = require("noblox.js");

const token = process.env.BOT_TOKEN;
const qOSKey = process.env.QOS_KEY;
const qsstGroupID = "5681740";
const sstAdminRoleID = "986687516591677510";
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers];
const partials = [Partials.GuildMember];

const client = new Client({ intents: intents, partials: partials });

/*
    Functions and jazz
*/

/**
 * Gets the Roblox name of a given Discord user using qOS.
 *
 * @param {*} discordID the Discord ID of the user whose name to retrieve
 * @returns the Roblox name of the user, or "Not found within qOS" if not found
 */
async function getRobloxName(discordID) {
    const response = await fetch(`https://api.quantum-science.xyz/Verification/getdata.php?Key=${qOSKey}&method=getFromDiscord&arg=${discordID}`, {
        method: "GET"
    });
    const data = await response.json();

    return data["result"].toLowerCase() == "found user" ? data["Username"] : "Not found within qOS";
}

/**
 * Gets the Roblox ID of a given Discord user using qOS.
 *
 * @param {*} discordID the Discord ID of the user whose Roblox ID to retrieve
 * @returns the Roblox ID of the user, or "Not found within qOS" if not found
 */
async function getRobloxID(discordID) {
    const response = await fetch(`https://api.quantum-science.xyz/Verification/getdata.php?Key=${qOSKey}&method=getFromDiscord&arg=${discordID}`, {
        method: "GET"
    });
    const data = await response.json();

    return data["result"].toLowerCase() == "found user" ? data["RobloxID"] : "Not found within qOS";
}

/**
 * @param {GuildMember | PartialGuildMember} member
 */
async function handleUserAcceptance(member) {
    const robloxID = await getRobloxID(member.id);

    try {
        // Terminate early using the catch because I don't wanna write another embed
        if (robloxID === "Not found within qOS") throw new Error();

        // Done button for when user has requested to the group
        const components = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${member.id}-done}`)
                    .setLabel("Done")
                    .setStyle(ButtonStyle.Primary),
            );

        const embed = new EmbedBuilder()
            .setTitle("New Supporter Onboarding")
            .setDescription(
                "Hello! You're receiving this because you're a new supporter of QSP. As such, you get access to the QSST group!"
                    + "\nPlease send a join request to the group and click the \"Done\" button once you have. You have 5 minutes."
            )
            .setColor(Colors.Blue);
        const confirmInteraction = await member.send({ embeds: [embed], components: [components] });
    } catch (err) {
        // Something failed so tell SST Admins
        const logChannelID = "1009515522972459068";
        const logChannel = client.channels.cache.get(logChannelID);

        const embed = new EmbedBuilder()
            .setTitle("New Supporter DM Failed")
            .setDescription("Failed to automatically accept a new supporter into the QSST group. Please do this manually.")
            .setColor(Colors.DarkRed);
        return await logChannel.send({ content: `b@&${sstAdminRoleID}>`, embeds: [embed] });
    }
}

/**
 * @param {GuildMember | PartialGuildMember} member
 */
async function handleUserKick(member) {

}

client.once('ready', async () => {
    // Log in with Noblox
    // cue terry disapproving stare
    // I couldn't get terry's other code to play nice so I took the easier route
    const robloxClient = await noblox.setCookie(process.env.ROBLOSECURITY);
    console.log(`Logged in as ${robloxClient.UserName}`);
    client.robloxClient = robloxClient;

    console.log("ready!");
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Stuff we need
    const supporterRoleIDs = ["1009885228023689226", "1009885281014513785", "1009885317291057182"];
    const qspID = "986685866661527562";
    const qsp = client.guilds.cache.get(qspID);
    const logChannelID = "1009515522972459068";
    const logChannel = client.channels.cache.get(logChannelID);

    // Check if user has role and if oldUser is a partial
    // oldUser partials only have the "@everyone" role, which is what the isPartial check looks for
    const hasRoleNow = supporterRoleIDs.find(roleID => newMember.roles.cache.has(roleID));
    const isPartial = oldMember.roles.cache.first() == oldMember.roles.cache.last() && oldMember.roles.cache.first().name == "@everyone";

    const robloxName = await getRobloxName(newMember.id);

    if (isPartial) {
        // Guild member partial, have to infer using newMember alone

        if (!hasRoleNow) {
            const embed = new EmbedBuilder()
                .setTitle("User Support Status Inference")
                .setDescription("A change in a user's support status occurred and I had to infer what happened. Please validate this if there is cause for concern.")
                .setColor(Colors.Gold)
                .addFields(
                    { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
                    { name: "Roblox name", value: robloxName },
                    { name: "Support Tier (guess)", value: "Stopped supporting" }
                );

            await logChannel.send({ embeds: [embed] });
            await handleUserKick(newMember)
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("User Support Status Inference")
            .setDescription("A change in a user's support status occurred and I had to infer what happened. Please validate this if there is cause for concern.")
            .setColor(Colors.Gold)
            .addFields(
                { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
                { name: "Roblox name", value: robloxName },
                { name: "Support Tier (guess)", value: qsp.roles.cache.get(hasRoleNow).name }
            );

        await logChannel.send({ embeds: [embed] });
        await handleUserAcceptance(newMember);

        return;
    }

    // oldUser isn't a partial, so check its roles too
    const hadRole = supporterRoleIDs.find(roleID => oldMember.roles.cache.has(roleID));

    if (!hadRole && hasRoleNow) {
        // Didn't have role before but has it now === new supporter!
        const embed = new EmbedBuilder()
            .setTitle("New Supporter!")
            .setDescription("There is a new person supporting QSP!")
            .setColor(Colors.Green)
            .addFields(
                { name: "User", value: `${oldMember.user.tag} (${oldMember.id})` },
                { name: "Roblox name", value: robloxName },
                { name: "Support Tier", value: qsp.roles.cache.get(hasRoleNow).name }
            );

        await logChannel.send({ embeds: [embed] });
        await handleUserAcceptance(newMember);

        return;
    } else if (hadRole && !hasRoleNow) {
        // Had role before but doesn't now === no longer supporting :(
        const embed = new EmbedBuilder()
            .setTitle("User Stopped Supporting")
            .setDescription("Someone is no longer supporting QSP.")
            .setColor(Colors.Red)
            .addFields(
                { name: "User", value: `${oldMember.user.tag} (${oldMember.id})` },
                { name: "Roblox name", value: robloxName },
            );

        await logChannel.send({ embeds: [embed] });
        await handleUserKick(newMember);

        return;
    }
});

client.on('guildMemberRemove', async member => {
    const supporterRoleIDs = ["1009885228023689226", "1009885281014513785", "1009885317291057182"];
    const logChannelID = "1009515522972459068";
    const logChannel = client.channels.cache.get(logChannelID);

    // Check if they had a supporter role
    const wasSupporter = supporterRoleIDs.some(roleID => member.roles.cache.has(roleID));

    // We don't care if they weren't supporting
    if (!wasSupporter) { return; }

    // Notify that a supporter left and handle the kick
    const embed = new EmbedBuilder()
        .setTitle("User Stopped Supporting")
        .setDescription("Someone is no longer supporting QSP.")
        .setColor(Colors.Red)
        .addFields(
            { name: "User", value: `${oldMember.user.tag} (${oldMember.id})` },
            { name: "Roblox name", value: robloxName },
        );

    return await logChannel.send({ embeds: [embed] });
});

client.login(token);
