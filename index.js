/*
    SST Support Manager
*/

require('dotenv').config();

const { Client, GatewayIntentBits, Partials, EmbedBuilder, Colors, GuildMember, PartialGuildMember, ActionRowBuilder, ButtonBuilder, ButtonStyle, User, Message } = require('discord.js');
const noblox = require('noblox.js'); // See Client.once('ready') block
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const Token = process.env.BOT_TOKEN;
const qOSKey = process.env.QOS_KEY;

const SST_Group_ID = 5681740;
const Benefit_Rank_ID = 9;
const SSTAdminRoleID = '986687516591677510';

// Stuff we need
// Benefactor Supporter Donor
const SupporterRoleIDs = ["1014919978627121166", "1007871031496675349", "1014918596771713116"];
const LogChannelID = '1009515522972459068';
const qspID = "346444423271415819";
const qsstID = "986685866661527562";

let LogChannel = null;
let QSP = null;
let QSST = null;

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
let GroupMemberCache = {
    "LastUpdated": null,
    "Users": {}
};

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
    .setDescription('Failed to handle an SST Task, please look into this to see if manual action is needed.')
    .setColor(Colors.DarkRed)
    .addFields(
        { name: 'Error Generated From', value: From },
        { name: 'Error Message', value: Error.toString() }
    );

    return await LogChannel.send({ embeds: [Embed] });
};

async function CheckGroupMembers() {
    // TODO: Note to Aer - check on unsubscribe (no wrongful kicks) and subscribe (no misranking)

    async function Check(Starting) {
        const Response = await fetch(`https://groups.roblox.com/v1/groups/${SST_Group_ID}/users?limit=10`, {
            method: 'GET'
        });

        const JSON = await Response.json()

        for (const User in JSON.data) {
            const Data = JSON.data[User];

            Users[Data.user.userId] = {
                Username: Data.user.username,
                RoleName: Data.role.name,
                RoleID: Data.role.id
            }
        };

        if (!JSON.previousPageCursor) {
            // not new, START RECURSING
        }
    };

    await Check(true)
}; //CheckGroupMembers()

/**
 * @param {GuildMember | PartialGuildMember} Member
 */
async function HandleUserAcceptance(Member) {
    try {
        // Terminate early
        const RobloxID = await GetRobloxID(Member.id);

        if (RobloxID === 'Not found within qOS') {
            const Embed = new EmbedBuilder()
                .setTitle("New Subscriber Information")
                .setDescription(
                    "Hello! Thank you for supporting Quantum with your purchase of a QSP premium membership.\n"
                        + "I noticed that you haven't verified with qOS (our bot) yet.\n"
                        + "Please verify in QSP and then contact an admin so you can get your benefits."
                    )
                .setColor(Colors.Blue)
            return await Member.send({ embeds: [Embed] });
        }

        const RobloxName = await GetRobloxName(Member.id);

        // Look for group request
        const Request = await noblox.getJoinRequest(SST_Group_ID, RobloxID);
        const IsInSST = await QSST.members.resolve(Member.id);

        if (Request != null) {
            // User is pending
            const Embed = new EmbedBuilder()
            .setTitle('New Subscriber is Pending')
            .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${RobloxID}&size=720x720&format=png&isCircular=false`)
            .setDescription('A new subscriber is pending to the QSST group.')
            .setColor(Colors.DarkBlue)
            .addFields(
                { name: 'User', value: `${Member.user.tag} (${Member.id})` },
                { name: 'Roblox Info', value: `${RobloxName} (**${RobloxID}**)` }
            );

            // Setup button data
            const AcceptID = (Math.random() + 1).toString(36).substring(7)
            const DeclineID = (Math.random() + 1).toString(36).substring(7)

            const Row = new ActionRowBuilder()
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

            let Message = await LogChannel.send({ content: `<@&${SSTAdminRoleID}>`, embeds: [Embed], components: [Row] });

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
        } else if (IsInSST) {
            const RankInGroup = await noblox.getRankNameInGroup(SST_Group_ID, RobloxID);

            const Embed = new EmbedBuilder()
            .setTitle("New Subscriber in SST")
            .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${RobloxID}&size=720x720&format=png&isCircular=false`)
            .setDescription("A new user has subscribed and is already in SST.")
            .setColor(Colors.Blue)
            .addFields(
                { name: 'User', value: `${Member.user.tag} (**${Member.id}**)` },
                { name: 'Roblox Info', value: `${RobloxName} (**${RobloxID}**)` },
                { name: "SST Rank", value: RankInGroup }
            );

            return await LogChannel.send({ embeds: [Embed] });
        };

        // User is not pending, so send an info message
        const Embed = new EmbedBuilder()
        .setTitle('New Subscriber - No Join Request')
        .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${RobloxID}&size=720x720&format=png&isCircular=false`)
        .setDescription('A new user has subscribed, but is not pending to the QSST group.')
        .setColor(Colors.Blue)
        .addFields(
            { name: 'User', value: `${Member.user.tag} (**${Member.id}**)` },
            { name: 'Roblox Info', value: `${RobloxName} (**${RobloxID}**)` }
        );

        RecentlySubscribedUsers[RobloxID] = {
            RobloxName: RobloxName,
            Checking: false,
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
            .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${RobloxID}&size=720x720&format=png&isCircular=false`)
            .setDescription('A user who has unsubscribed was not in QSST group.')
            .setColor(Colors.Blue)
            .addFields(
                { name: 'User', value: `${Member.user.tag} (**${Member.id}**)` },
                { name: 'Roblox Info', value: `${RobloxName} (**${RobloxID}**)` }
            );

            return await LogChannel.send({ embeds: [Embed] });
        }

        // Exile them from the group because they're just a supporter
        if (SST_Rank == 9) {
            await noblox.exile(SST_Group_ID, RobloxID);

            const Embed = new EmbedBuilder()
            .setTitle('Automatic SST User Removal')
            .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${RobloxID}&size=720x720&format=png&isCircular=false`)
            .setDescription('User who unsubscribed was in SST group and was automatically removed.')
            .setColor(Colors.Blue)
            .addFields(
                { name: 'User', value: `${Member.user.tag} (**${Member.id}**)` },
                { name: 'Roblox Info', value: `${RobloxName} (**${RobloxID}**)` }
            );

            return await LogChannel.send({ embeds: [Embed] });
        }

        const Embed = new EmbedBuilder()
        .setTitle("Member of SST Unsubscribed")
        .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${RobloxID}&size=720x720&format=png&isCircular=false`)
        .setDescription("User who unsubscribed is a member of SST and therefore was not removed from the group.")
        .setColor(Colors.Blue)
        .addFields(
            { name: 'User', value: `${Member.user.tag} (**${Member.id}**)` },
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
    //const isPartial = oldMember.roles.cache.first() == oldMember.roles.cache.last() && oldMember.roles.cache.first().name == '@everyone';

    const RobloxName = await GetRobloxName(newMember.id);
    const RobloxID = await GetRobloxID(newMember.id);

    if (typeof oldMember == PartialGuildMember) {

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
        const MemberRoles = interaction.member.roles;
        if (!MemberRoles.resolve("986687516591677510") // Doesn't have SST Administrator role
            && !MemberRoles.resolve("986687457124831273") // Doesn't have leadership role
            && interaction.member.id !== "195942662241648640" // Isn't Aer
        ) return;

        if (ButtonData[interaction.customId]) {
            const Data = ButtonData[interaction.customId]

            if (Data.Type == 'Accept') {
                try {
                    await noblox.handleJoinRequest(SST_Group_ID, Data.RobloxID, true)

                    const Embed = new EmbedBuilder()
                    .setTitle('New Subscriber Accepted')
                    .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${Data.RobloxID}&size=720x720&format=png&isCircular=false`)
                    .setDescription('A new subscriber has been accepted into SST.')
                    .setColor(Colors.Green)
                    .addFields(
                        { name: 'User', value: `${Data.Member.user.tag} (${Data.Member.id})` },
                        { name: 'Roblox Info', value: `[${Data.RobloxName}](https://roblox.com/users/${Data.RobloxID}) **(${Data.RobloxID})**` },
                        { name: "SST Admin", value: `${interaction.user.tag}:${interaction.user.id}` }
                    );

                    // Change them to the right rank if they're not already in the group
                    if (!QSST.members.resolve(Data.Member.user.id)) {
                        await noblox.setRank(SST_Group_ID, Data.RobloxID, Benefit_Rank_ID);
                    } else {
                        Embed.setTitle("New Subscriber Already In QSST");
                        Embed.setDescription("Someone who is already in QSST has subscribed.");
                    }

                    await Data.Message.edit({ content: '', embeds: [Embed], components: [] });
                } catch(err) {
                    return await HandleError(err, `Handling a SST Accept (interactionCreate) for ${Data.RobloxID}`)
                }

                // We assume decline otherwise
            } else {
                try {
                    noblox.handleJoinRequest(SST_Group_ID, Data.RobloxID, false)

                    const Embed = new EmbedBuilder()
                    .setTitle('New Subscriber Declined')
                    .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${Data.RobloxID}&size=720x720&format=png&isCircular=false`)
                    .setDescription('A new subscriber has been declined from SST.')
                    .setColor(Colors.Red)
                    .addFields(
                        { name: 'User', value: `${Data.Member.user.tag} (${Data.Member.id})` },
                        { name: 'Roblox Info', value: `${Data.RobloxName} (**${Data.RobloxID}**)` },
                        { name: "SST Admin", value: `${interaction.user.tag}:${interaction.user.id}` }
                    );

                    await Data.Message.edit({ content: '', embeds: [Embed], components: [] });
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
	    
        let QSSTMember;

	    try {
            QSSTMember = await QSST.members.fetch({ user: message.author.id });
	    } catch (Err) {
		    return;
	    }

        if (QSSTMember == null || QSSTMember == undefined){
            return await message.reply("Couldn't find your permissions.");
        }

        if (
            !QSSTMember.roles.cache.has("986687516591677510")
            && message.author.id !== "195942662241648640"
        ) return;

        let MessageContent = message.content.slice(';').split(' ')
        let CMD = MessageContent[0].toLowerCase();

        if (CMD == ';subscribers') {
            const Embed = new EmbedBuilder()
            .setTitle('SST Manager - Subscribers')
            .setColor(Colors.White)

            let Completed = {};
            let List = '';
            let SubCount = 0;

            for (const ID of SupporterRoleIDs) {
                const Users = await QSP.roles.cache.get(ID).members

                for (const [_, User] of Users) {
                    if (await Completed[User.user.id]) continue

                    Completed[User.user.id] = true

                    const RobloxName = await GetRobloxName(User.user.id)
                    const RobloxID = await GetRobloxID(User.user.id)

                    List = List + `\nDiscord: **${User.user.username}** - Roblox: [${RobloxName}](https://roblox.com/users/${RobloxID})`
                    SubCount++;
                };
            }; Completed = {};

            Embed.setDescription((List == '' && 'None found') || List)
            Embed.setFooter({ text: `Total subs: ${SubCount}` });

            return await message.channel.send({ embeds: [Embed] })
        } else if (CMD == ';register') {
            let UsersToRegister = [];

		    MessageContent.shift();

            if (MessageContent.length == 0) {
                    if (message.mentions.members.keys.length == 0) {
                        return await message.reply("Couldn't find the users you wanted to register.");
                    }

                    UsersToRegister = [];

                    for (const Mention of message.mentions.members) {
                        UsersToRegister.push(Mention[1].id); // Insert the guild member
                    }
                } else {
                    for (const UserId of MessageContent) {
                        let ResolvedUser;
                
                        try {
                            ResolvedUser = await QSP.members.fetch({ user: UserId });
                        } catch (Err) {

                        return;
                    }

                    if (ResolvedUser == null || ResolvedUser == undefined) {
                        continue;
                    }

                    UsersToRegister.push(ResolvedUser);
                }
            }

            for (const User of UsersToRegister) {
                HandleUserAcceptance(User);
            }
        }
    } catch(err) {
        return await HandleError(err, 'MessageCreate')
    }
})

// Protect against SST admins trying to delete messages from the bot
SST_Client.on("messageDelete", async Message => {
    try {
        if (Message.author.id !== SST_Client.user.id) return;
        const Klear = QSST.members.resolve("195942662241648640");
        await Klear.send("Someone tried to delete a message!");
        await Klear.send({ content: "Message", embeds: Message.embeds });
    } catch (Err) {
        console.error(Err);
    }
});

async function JoinReqData(RequestData) {
    const User = RequestData.requester

    if (!RecentlySubscribedUsers[User.userId]) return

    if (RecentlySubscribedUsers[User.userId].Checking) return;

    RecentlySubscribedUsers[User.userId].Checking = true

    const Data = RecentlySubscribedUsers[User.userId]

    try {
        // User is pending
        const Embed = new EmbedBuilder()
        .setTitle('A New Subscriber Is Pending')
        .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${User.userId}&size=720x720&format=png&isCircular=false`)
        .setDescription('A new subscriber is pending to the QSST group.')
        .setColor(Colors.DarkBlue)
        .addFields(
            { name: 'User', value: `${Data.Member.user.tag} (**${Data.Member.id}**)` },
            { name: 'Roblox Info', value: `[${Data.RobloxName}](https://roblox.com/users/${User.userId}) **(${User.userId})**` }
        );

        // Setup button data
        const AcceptID = (Math.random() + 1).toString(36).substring(7)
        const DeclineID = (Math.random() + 1).toString(36).substring(7)

        const Row = new ActionRowBuilder()
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

        let Message = await LogChannel.send({ content: `<@&${SSTAdminRoleID}>`, embeds: [Embed], components: [Row] });

        ButtonData[AcceptID] = {
            Type: 'Accept',
            RobloxID: User.userId,
            RobloxName: Data.RobloxName,
            Member: Data.Member,
            Message: Message
        }

        ButtonData[DeclineID] = {
            Type: 'Decline',
            RobloxID: User.userId,
            RobloxName: Data.RobloxName,
            Member: Data.Member,
            Message: Message
        }
    } catch(err) {
        return await HandleError(err, `Join request handling | JoinReqData`)
    }
}

async function JoinReqError(Err) {
    return await console.log(`[ERROR DUMP]: Join request handling | JoinReqError | ${Err}`)

    //return await HandleError(Err, `Join request handling | JoinReqError`)
}

SST_Client.once('ready', async () => {
    QSP = await SST_Client.guilds.cache.get(qspID);
    QSST = await SST_Client.guilds.cache.get(qsstID);
    LogChannel = await SST_Client.channels.cache.get(LogChannelID);

    //cache
    await QSP.members.fetch()
    await QSST.members.fetch();

    for (ID in SupporterRoleIDs) {
        await QSP.roles.cache.get(ID)
    }

    const RobloxClient = await noblox.setCookie(process.env.ROBLOSECURITY);
    console.log(`Logged in as ${RobloxClient.UserName}`);

    const JoinEvent = noblox.onJoinRequest(SST_Group_ID);
    JoinEvent.on('data', JoinReqData);
    JoinEvent.on('error', JoinReqError);

    console.log('ready!');
});

SST_Client.login(Token);
