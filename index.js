require("dotenv").config();

const { Client, GatewayIntentBits, Partials, EmbedBuilder, Colors, GuildMember, PartialGuildMember, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const noblox = require("noblox.js"); // See client.once('ready') block
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const token = process.env.BOT_TOKEN;
const qOSKey = process.env.QOS_KEY;
const qsstGroupID = "5681740";
const sstAdminRoleID = "986687516591677510";
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers];
const partials = [Partials.GuildMember];

// Stuff we need
const supporterRoleIDs = ["1009885228023689226", "1009885281014513785", "1009885317291057182"];
const logChannelID = "1009515522972459068";
const qspID = "986685866661527562";

let logChannel = null
let qsp = null

const client = new Client({ intents: intents, partials: partials });

// Array of the Roblox IDs of users who have recently subscribed but were not pending to the SST group
const recentlySubscribedUsers = [];

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
 * Gets the Discord ID of a given Roblox user using qOS.
 *
 * @param {*} robloxID the roblox ID of the person whose Discord ID to retrieve
 * @returns the Discord ID of the user, or "Not found within qOS" if not found
 */
async function getDiscordID(robloxID) {
    const response = await fetch(`https://api.quantum-science.xyz/Verification/getdata.php?Key=${qOSKey}&method=getFromRobloxID&arg=${robloxID}`, {
        method: "GET"
    });
    const data = await response.json();

    return data["result"].toLowerCase() == "found user" ? data["DiscordID"] : "Not found within qOS";
}

/**
 * @param {GuildMember | PartialGuildMember} member
 */
async function handleUserAcceptance(member) {
    const robloxID = await getRobloxID(member.id);
    const robloxName = await getRobloxName(member.id);
    const logChannelID = "1009515522972459068";
    const logChannel = client.channels.cache.get(logChannelID);

    try {
        // Terminate early using the catch because I don't wanna write another embed
        if (robloxID === "Not found within qOS") throw new Error(robloxID);

        let request = await noblox.getJoinRequest(qsstGroupID, robloxID);

        if (request != null) {
            // User is pending
            const embed = new EmbedBuilder()
            .setTitle("New Subscriber is Pending")
            .setDescription("A new subscriber is already pending to the QSST group. Vetting may begin.")
            .setColor(Colors.DarkBlue)
            .addFields(
                { name: "User", value: `${member.user.tag} (${member.id})` },
                { name: "Roblox name", value: robloxName },
            );

            const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
				.setLabel('Accept into QSST')
                .setCustomId(`Accept_${robloxID}`)
				.setStyle(ButtonStyle.Success),

                new ButtonBuilder()
				.setLabel('Decline request')
                .setCustomId(`Decline_${robloxID}`)
				.setStyle(ButtonStyle.Danger)
			);

            return await logChannel.send({ /* content: `<@&${sstAdminRoleID}>` , */ embeds: [embed], components: [row] });
        }

        // User is not pending, so send an info message
        const embed = new EmbedBuilder()
        .setTitle("Waiting for New Subscriber to Pend")
        .setDescription("A new user has subscribed but is not pending to the QSST group.")
        .setColor(Colors.Blue)
        .addFields(
            { name: "User", value: `${member.user.tag} (${member.id})` },
            { name: "Roblox name", value: robloxName },
        );

        await logChannel.send({ embeds: [embed] });

        // Try to inform the user to submit a join request
        try {
            const memberNotifEmbed = new EmbedBuilder()
            .setTitle("New Supporter Notification")
            .setColor(Colors.Blue)
            .setDescription(
                "Hello! Thank you for supporting Quantum with your purchase of a QSP premium membership."
                    + "\nI noticed that you aren't pending to join the QSST group. Please do so here."
                    + "\nhttps://www.roblox.com/groups/5681740/Quantum-Structural-Science-Team"
                    + "\n\nYou will be vetted once you submit your join request."
            );

            return await member.send({ embeds: [memberNotifEmbed] });
        } catch (err) {
            return await logChannel.send(`Failed to notify ${member.user.tag} to request to join the SST group.`)
        }
    } catch (err) {
        console.log(`Error handling subscribe for ${member.user.tag} (${member.id}) | ${err}`)

        // Something failed so tell SST Admins
        const embed = new EmbedBuilder()
        .setTitle("New Supporter Handling Failed")
        .setDescription("Failed to automatically handle a new supporter. Please do this manually.")
        .setColor(Colors.DarkRed)
        .addFields(
            { name: "User", value: `${member.user.tag} (${member.id})` },
            { name: "Roblox name", value: robloxName },
        );

        return await logChannel.send({ /* content: `<@&${sstAdminRoleID}>` , */  embeds: [embed] });
    }
}

/**
 * @param {GuildMember | PartialGuildMember} member
 */
async function handleUserKick(member) {
    const robloxID = await getRobloxID(member.id);
    const robloxName = await getRobloxName(member.id);
    const logChannelID = "1009515522972459068";
    const logChannel = client.channels.cache.get(logChannelID);

    try {
        // Terminate early using catch block because I don't want to write another embed
        if (robloxID === "Not found within qOS") throw new Error(robloxID);

        // Check if user is even in QSST or if they left already
        let rankInSST = await noblox.getRankInGroup(qsstGroupID, robloxID);

        if (rankInSST === 0) {
            const embed = new EmbedBuilder()
            .setTitle("Automatic SST User Removal")
            .setDescription("User who unsubscribed was not in QSST group. No further action should be necessary.")
            .setColor(Colors.Blue)
            .addFields(
                { name: "User", value: `${member.user.tag} (${member.id})` },
                { name: "Roblox name", value: robloxName },
            );

            return await logChannel.send({ embeds: [embed] });
        }

        // Exile them from the group
        await noblox.exile(qsstGroupID, robloxID);

        const embed = new EmbedBuilder()
        .setTitle("Automatic SST User Removal")
        .setDescription("User who unsubscribed was in SST group and was automatically removed. No further action should be necessary.")
        .setColor(Colors.Blue)
        .addFields(
            { name: "User", value: `${member.user.tag} (${member.id})` },
            { name: "Roblox name", value: robloxName },
        );

        return await logChannel.send({ embeds: [embed] });
    } catch (err) {
        console.log(`Error handling unsubscribe for ${member.user.tag} (${member.id}) | ${err}`)

        // Something failed so tell SST Admins
        const embed = new EmbedBuilder()
        .setTitle("Automatic SST User Removal Failed")
        .setDescription("Failed to automatically kick an unsubscribed supporter out of the QSST group. Please do this manually.")
        .setColor(Colors.DarkRed)
        .addFields(
            { name: "User", value: `${member.user.tag} (${member.id})` },
            { name: "Roblox name", value: robloxName },
        );

        return await logChannel.send({ /* content: `<@&${sstAdminRoleID}>` , */  embeds: [embed] });
    }
};

client.on('guildMemberUpdate', async (oldMember, newMember) => {
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
            return await handleUserKick(newMember)
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
        return await handleUserAcceptance(newMember, true);
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
        return await handleUserAcceptance(newMember);
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
        return await handleUserKick(newMember);
    }
});

client.on('guildMemberRemove', async member => {
    const supporterRoleIDs = ["1009885228023689226", "1009885281014513785", "1009885317291057182"];
    const logChannelID = "1009515522972459068";
    const logChannel = client.channels.cache.get(logChannelID);

    // Check if they had a supporter role
    const wasSupporter = supporterRoleIDs.some(roleID => member.roles.cache.has(roleID));

    // We don't care if they weren't supporting
    if (!wasSupporter) return;

    // Notify that a supporter left and handle the kick
    const embed = new EmbedBuilder()
    .setTitle("User Stopped Supporting")
    .setDescription("Someone is no longer supporting QSP.")
    .setColor(Colors.Red)
    .addFields(
        { name: "User", value: `${oldMember.user.tag} (${oldMember.id})` },
        { name: "Roblox name", value: robloxName },
    );

    await logChannel.send({ embeds: [embed] });
    return await handleUserKick(member);
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isChatInputCommand()) return;

})

async function JoinReqData(Data) {

}

async function JoinReqError(Err) {

}

client.once('ready', async () => {
    // cuh
    qsp = await client.guilds.cache.get(qspID);
    logChannel = await client.channels.cache.get(logChannelID)

    // Log in with Noblox
    // cue terry disapproving stare
    // I couldn't get terry's other code to play nice so I took the easier route
    const robloxClient = await noblox.setCookie(process.env.ROBLOSECURITY);
    console.log(`Logged in as ${robloxClient.UserName}`);

    const joinRequestEvent = noblox.onJoinRequest(parseInt(qsstGroupID));

    joinRequestEvent.on("data", JoinReqData);
    joinRequestEvent.on("error", JoinReqError);

    console.log("ready!");
});

client.login(token);