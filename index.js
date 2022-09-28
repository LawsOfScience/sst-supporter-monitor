/*
    SST Support Manager
*/

require('dotenv').config();

const { Client, GatewayIntentBits, Partials, EmbedBuilder, Colors, GuildMember, PartialGuildMember, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const noblox = require('noblox.js'); // See Client.once('ready') block
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const Token = process.env.BOT_TOKEN;
const qOSKey = process.env.QOS_KEY;

const SST_Group_ID = 5681740;
const Benefit_Rank_ID = 9;
const SSTAdminRoleID = '986687516591677510';

// Stuff we need
const SupporterRoleIDs = ['1009885228023689226', '1009885281014513785', '1009885317291057182'];
const LogChannelID = '1009515522972459068';
const qspID = '986685866661527562';

let LogChannel = null
let QSP = null

const SST_Client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildMembers
    ], 
    
    partials: [
        Partials.GuildMember
    ] 
});

// Array of the Roblox IDs of users who have recently subscribed but were not pending to the SST group
let RecentlySubscribedUsers = {};
let ButtonData = {};

let Cache = {};

/*
    Functions and jazz
*/

/**
 * Gets the Roblox name of a given Discord user using qOS.
 *
 * @param {*} DiscordID the Discord ID of the user whose name to retrieve
 * @returns the Roblox name of the user, or 'Not found within qOS' if not found
 */
async function GetRobloxName(DiscordID, Override) {
    if (Cache[`${DiscordID}_RNAME`] && !Override) return Cache[`${DiscordID}_RNAME`];

    const Response = await fetch(`https://api.quantum-science.xyz/Verification/getdata.php?Key=${qOSKey}&method=getFromDiscord&arg=${DiscordID}`, {
        method: 'GET'
    });

    const JSON = await Response.json();

    const Return = JSON['result'].toLowerCase() == 'found user' ? JSON['Username'] : 'Not found within qOS'

    Cache[`${DiscordID}_RNAME`] = Return

    return Return;
};

/**
 * Gets the Roblox ID of a given Discord user using qOS.
 *
 * @param {*} DiscordID the Discord ID of the user whose Roblox ID to retrieve
 * @returns the Roblox ID of the user, or 'Not found within qOS' if not found
 */
async function GetRobloxID(DiscordID, Override) {
    if (Cache[`${DiscordID}_RID`] && !Override) return Cache[`${DiscordID}_RID`];

    const Response = await fetch(`https://api.quantum-science.xyz/Verification/getdata.php?Key=${qOSKey}&method=getFromDiscord&arg=${DiscordID}`, {
        method: 'GET'
    });

    const JSON = await Response.json();

    const Return = JSON['result'].toLowerCase() == 'found user' ? JSON['RobloxID'] : 'Not found within qOS';

    Cache[`${DiscordID}_RID`] = Return;

    return Return;
};

/**
 * Gets the Discord ID of a given Roblox user using qOS.
 *
 * @param {*} RobloxID the roblox ID of the person whose Discord ID to retrieve
 * @returns the Discord ID of the user, or 'Not found within qOS' if not found
 */
async function GetDiscordID(RobloxID, Override) {
    if (Cache[RobloxID] && !Override) return Cache[RobloxID];

    const Response = await fetch(`https://api.quantum-science.xyz/Verification/getdata.php?Key=${qOSKey}&method=getFromRobloxID&arg=${RobloxID}`, {
        method: 'GET'
    });

    const JSON = await Response.json();

    const Result = JSON['result'].toLowerCase() == 'found user' ? JSON['DiscordID'] : 'Not found within qOS';

    Cache[RobloxID] = Result;

    return Result;
};

async function HandleError(Error, From) {
    console.log(`[ERROR DUMP]: SST Manager ran into an error from ${From}; ${Error}\n${Error.stack}`)

    // Something failed so tell SST Admins
    const Embed = new EmbedBuilder()
    .setTitle('SST Manager Error')
    .setDescription('Failed to handle an SST Task, please look into this.')
    .setColor(Colors.DarkRed)
    .addFields(
        { name: 'Error Generated From', value: From },
        { name: 'Error Message', value: Error.toString() }
    );

    return await LogChannel.send({ content: `<@&${SSTAdminRoleID}>`, embeds: [Embed] });
}

/**
 * @param {GuildMember | PartialGuildMember} Member
 */
async function HandleUserAcceptance(Member) {
    try {
        // Terminate early
        const RobloxID = await GetRobloxID(Member.id);

        if (RobloxID === 'Not found within qOS') throw new Error(RobloxID);

        const RobloxName = await GetRobloxName(Member.id);

        // Look for group request
        const Request = await noblox.getJoinRequest(SST_Group_ID, RobloxID);

        if (Request != null) {
            // User is pending
            const Embed = new EmbedBuilder()
            .setTitle('New Subscriber is Pending')
            .setDescription('A new subscriber is pending to the QSST group. Vetting may begin.')
            .setColor(Colors.DarkBlue)
            .addFields(
                { name: 'User', value: `${Member.user.tag} (${Member.id})` },
                { name: 'Roblox Name', value: RobloxName }
            );

            // Setup button data
            const AcceptID = (Math.random() + 1).toString(36).substring(7)
            const DeclineID = (Math.random() + 1).toString(36).substring(7)

            const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
				.setLabel('Accept into QSST')
                .setCustomId(AcceptID)
				.setStyle(ButtonStyle.Success),

                new ButtonBuilder()
				.setLabel('Decline request')
                .setCustomId(DeclineID)
				.setStyle(ButtonStyle.Danger)
			);

            let Message = await LogChannel.send({ content: `<@&${SSTAdminRoleID}>`, embeds: [Embed], components: [row] });

            ButtonData[AcceptID] = {
                Type: 'Accept',
                RobloxID: RobloxID,
                RobloxName: RobloxName,
                Member: Member,
                Message: Message
            }
        
            ButtonData[DeclineID] = {
                Type: 'Decline',
                RobloxID: RobloxID,
                Member: Member,
                RobloxName: RobloxName,
                Message: Message
            }

            return;
        };

        // User is not pending, so send an info message
        const Embed = new EmbedBuilder()
        .setTitle('Waiting for New Subscriber to Pend')
        .setDescription('A new user has subscribed but is not pending to the QSST group.')
        .setColor(Colors.Blue)
        .addFields(
            { name: 'User', value: `${Member.user.tag} (${Member.id})` },
            { name: 'Roblox name', value: RobloxName },
        );

        RecentlySubscribedUsers[RobloxID] = {
            RobloxName: RobloxName,
            Accepted: false,
            Member: Member
        }

        await LogChannel.send({ embeds: [Embed] });

        // Try to inform the user to submit a join request
        try {
            const memberNotifEmbed = new EmbedBuilder()
            .setTitle('New Supporter Notification')
            .setColor(Colors.Blue)
            .setDescription(
                'Hello! Thank you for supporting Quantum with your purchase of a QSP premium membership.'
                    + '\nI noticed that you aren\'t pending to join the QSST group. Please do so here.'
                    + '\nhttps://www.roblox.com/groups/5681740/Quantum-Structural-Science-Team'
                    + '\n\nYou will be vetted once you submit your join request.'
            );

            return await Member.send({ embeds: [memberNotifEmbed] });
        } catch (err) {
            return await LogChannel.send(`Failed to notify ${Member.user.tag} to request to join the SST group.`)
        }
    } catch (err) {
        return await HandleError(err, `Handling a subscription for ${Member.user.tag} (${Member.id})`)
    }
}

/**
 * @param {GuildMember | PartialGuildMember} Member
 */
async function HandleUserKick(Member) {
    try {
        // Terminate early
        const RobloxID = await GetRobloxID(Member.id);

        if (RobloxID === 'Not found within qOS') throw new Error(RobloxID);

        const RobloxName = await GetRobloxName(Member.id);

        // Check if user is even in QSST or if they left already
        const SST_Rank = await noblox.getRankInGroup(SST_Group_ID, RobloxID);

        if (SST_Rank === 0) {
            const Embed = new EmbedBuilder()
            .setTitle('Automatic SST User Removal')
            .setDescription('User who unsubscribed was not in QSST group. No further action should be necessary.')
            .setColor(Colors.Blue)
            .addFields(
                { name: 'User', value: `${Member.user.tag} (${Member.id})` },
                { name: 'Roblox Info', value: `${RobloxName} (**${RobloxID}**)` }
            );

            return await LogChannel.send({ embeds: [Embed] });
        }

        // Exile them from the group
        await noblox.exile(SST_Group_ID, RobloxID);

        const Embed = new EmbedBuilder()
        .setTitle('Automatic SST User Removal')
        .setDescription('User who unsubscribed was in SST group and was automatically removed. No further action should be necessary.')
        .setColor(Colors.Blue)
        .addFields(
            { name: 'User', value: `${Member.user.tag} (${Member.id})` },
            { name: 'Roblox Info', value: `${RobloxName} (**${RobloxID}**)` }
        );

        return await LogChannel.send({ embeds: [Embed] });
    } catch (err) {
        return await HandleError(err, `Handling a SST Removal (Unsubscribe) for ${Member.user.tag} (${Member.id})`)
    }
};

SST_Client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Check if user has role and if oldUser is a partial
    // oldUser partials only have the '@everyone' role, which is what the isPartial check looks for
    const hasRoleNow = SupporterRoleIDs.find(roleID => newMember.roles.cache.has(roleID));
    const isPartial = oldMember.roles.cache.first() == oldMember.roles.cache.last() && oldMember.roles.cache.first().name == '@everyone';

    const RobloxName = await GetRobloxName(newMember.id);
    const RobloxID = await GetRobloxName(newMember.id);

    if (isPartial) {
        if (!hasRoleNow) {
            return await HandleUserKick(newMember)
        }

        const Embed = new EmbedBuilder()
        .setTitle('User Support Status Inference')
        .setDescription('A change in a user\'s support status occurred and I had to infer what happened.')
        .setColor(Colors.Gold)
        .addFields(
            { name: '[ESTIMATE] Support Tier', value: QSP.roles.cache.get(hasRoleNow).name },
            { name: 'User', value: `${newMember.user.tag} (**${newMember.id}**)` },
            { name: 'Roblox Info', value: `${RobloxName} (**${RobloxID}**)` }
        );

        await LogChannel.send({ embeds: [Embed] });

        return await HandleUserAcceptance(newMember);
    }

    // oldUser isn't a partial, so check its roles too
    const hadRole = SupporterRoleIDs.find(roleID => oldMember.roles.cache.has(roleID));

    if (!hadRole && hasRoleNow) {
        return await HandleUserAcceptance(newMember);
    } else if (hadRole && !hasRoleNow) {
        return await HandleUserKick(newMember);
    }
});

SST_Client.on('guildMemberRemove', async Member => {
    // Check if they had a supporter role
    const WasSupporter = SupporterRoleIDs.some(roleID => Member.roles.cache.has(roleID));

    // We don't care if they weren't supporting
    if (!WasSupporter) return;

    return await HandleUserKick(Member);
});

SST_Client.on('interactionCreate', async interaction => {
	if (interaction.isButton()) {
        if (ButtonData[interaction.customId]) {
            const Data = ButtonData[interaction.customId]
            
            if (Data.Type == 'Accept') {
                try {
                    await noblox.handleJoinRequest(SST_Group_ID, Data.RobloxID, true)

                    // Change them to the right rank
                    await noblox.setRank(SST_Group_ID, Data.RobloxID, Benefit_Rank_ID)

                    const Embed = new EmbedBuilder()
                    .setTitle('New Subscriber Accepted')
                    .setDescription('A new subscriber has been accepted into SST.')
                    .setColor(Colors.Green)
                    .addFields(
                        { name: 'User', value: `${Data.Member.user.tag} (${Data.Member.id})` },
                        { name: 'Roblox name', value: Data.RobloxName },
                    );

                    await Data.Message.edit({ embeds: [Embed], components: [] });
                } catch(err) {
                    return await HandleError(err, `Handling a SST Accept (interactionCreate) for ${Data.RobloxID}`)
                }

                // We assume decline otherwise
            } else {
                try {
                    noblox.handleJoinRequest(SST_Group_ID, Data.RobloxID, false)

                    const Embed = new EmbedBuilder()
                    .setTitle('New Subscriber Declined')
                    .setDescription('A new subscriber has been declined from SST.')
                    .setColor(Colors.Green)
                    .addFields(
                        { name: 'User', value: `${Data.Member.user.tag} (${Data.Member.id})` },
                        { name: 'Roblox name', value: Data.RobloxName },
                    );
    
                    await Data.Message.edit({ embeds: [Embed], components: [] });
                } catch(err) {
                    return await HandleError(err, `Handling a SST Decline (interactionCreate) for ${Data.RobloxID}`)
                }
            }
        }
    }
})

SST_Client.on('messageCreate', async message => {
    try {
        if (message.author.bot) return;

        if (!message.content.startsWith(';')) return;
        
        let MessageContent = message.content.slice(';').split(' ')
        let CMD = MessageContent[0].toLowerCase();
        
        if (CMD == ';subscribers') {
            const Embed = new EmbedBuilder()
            .setTitle('SST Manager - Subscribers')
            .setColor(Colors.White)
    
            let Completed = {};
            let List = '';
    
            for (const ID of SupporterRoleIDs) {
                const Users = await QSP.roles.cache.get(ID).members
    
                for (const [_, User] of Users) {
                    if (await Completed[User.user.id]) continue
    
                    Completed[User.user.id] = true
    
                    const RobloxName = await GetRobloxName(User.user.id)
                    const RobloxID = await GetRobloxID(User.user.id)
    
                    List = List + `\nDiscord: **${User.user.username}** - Roblox: [${RobloxName}](https://roblox.com/users/${RobloxID})`
                };
            }; Completed = {};
    
            await Embed.setDescription((List == '' && 'None found') || List)
    
            return await message.channel.send({ embeds: [Embed] })
        }
    } catch(err) {
        return await HandleError(err, 'MessageCreate')
    }
})

async function JoinReqData(RequestData) {
    const User = RequestData.requester

    if (!RecentlySubscribedUsers[User.userId]) return

    if (RecentlySubscribedUsers[User.userId].Accepted) return

    const Data = RecentlySubscribedUsers[User.userId]

    try {
        // User is pending
        const Embed = new EmbedBuilder()
        .setTitle('New Subscriber is Pending')
        .setDescription('A new subscriber is pending to the QSST group. Vetting may begin.')
        .setColor(Colors.DarkBlue)
        .addFields(
            { name: 'User', value: `${Data.Member.user.tag} (${Data.Member.id})` },
            { name: 'Roblox Name', value: Data.RobloxName },
        );

        // Setup button data
        const AcceptID = (Math.random() + 1).toString(36).substring(7)
        const DeclineID = (Math.random() + 1).toString(36).substring(7)

        const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
            .setLabel('Accept into QSST')
            .setCustomId(AcceptID)
            .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
            .setLabel('Decline request')
            .setCustomId(DeclineID)
            .setStyle(ButtonStyle.Danger)
        );

        let Message = await LogChannel.send({ /* content: `<@&${SSTAdminRoleID}>` , */ embeds: [Embed], components: [row] });

        ButtonData[AcceptID] = {
            Type: 'Accept',
            RobloxID: Data.RobloxID,
            RobloxName: Data.RobloxName,
            Member: Data.Member,
            Message: Message
        }

        ButtonData[DeclineID] = {
            Type: 'Decline',
            RobloxID: Data.RobloxID,
            RobloxName: Data.RobloxName,
            Member: Data.Member,
            Message: Message
        }
    } catch(err) {
        return await HandleError(err, `Join request handling | JoinReqData`)
    }
}

async function JoinReqError(Err) {
    return await HandleError(Err, `Join request handling | JoinReqError`)
}

SST_Client.once('ready', async () => {
    QSP = await SST_Client.guilds.cache.get(qspID);
    LogChannel = await SST_Client.channels.cache.get(LogChannelID)

    const RobloxClient = await noblox.setCookie(process.env.ROBLOSECURITY);
    console.log(`Logged in as ${RobloxClient.UserName}`);

    noblox.onJoinRequest(SST_Group_ID)
    .on('data', JoinReqData)
    .on('error', JoinReqError)

    console.log('ready!');
});

SST_Client.login(Token);