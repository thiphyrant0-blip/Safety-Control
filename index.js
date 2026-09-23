// ============================================================
// 🛡️ SECURITY SYSTEM
// Discord.js v14
// Render Ready
// ============================================================

require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    AuditLogEvent,
    EmbedBuilder
} = require("discord.js");

const express = require("express");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const QUARANTINE_ROLE_ID = process.env.QUARANTINE_ROLE_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

// ============================================================
// CHECK ENV
// ============================================================

if (!TOKEN) {
    console.error("❌ ไม่พบ TOKEN ใน .env");
    process.exit(1);
}

if (!GUILD_ID) {
    console.error("❌ ไม่พบ GUILD_ID ใน .env");
    process.exit(1);
}

if (!QUARANTINE_ROLE_ID) {
    console.error("❌ ไม่พบ QUARANTINE_ROLE_ID ใน .env");
    process.exit(1);
}

if (!LOG_CHANNEL_ID) {
    console.error("❌ ไม่พบ LOG_CHANNEL_ID ใน .env");
    process.exit(1);
}

// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration

    ],

    partials: [

        Partials.Channel,
        Partials.Message,
        Partials.GuildMember,
        Partials.User

    ]

});

// ============================================================
// EXPRESS SERVER
// ============================================================

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {

    res.send("🛡️ Security Bot is running!");

});

app.listen(PORT, () => {

    console.log(
        `🌐 Web Server running on port ${PORT}`
    );

});

// ============================================================
// SETTINGS
// ============================================================

// ------------------------------------------------------------
// ANTI SPAM
// ------------------------------------------------------------

const SPAM_LIMIT = 5;

// 15 วินาที
const SPAM_WINDOW = 15 * 1000;

// Timeout 10 นาที
const SPAM_TIMEOUT = 10 * 60 * 1000;


// ------------------------------------------------------------
// ANTI NUKE
// ------------------------------------------------------------

// ทำเกิน 3 ครั้ง
const NUKE_LIMIT = 3;

// ภายใน 10 วินาที
const NUKE_WINDOW = 10 * 1000;

// ============================================================
// STORAGE
// ============================================================

const spamMap = new Map();

const nukeMap = new Map();

// ============================================================
// LOG FUNCTION
// ============================================================

async function sendLog(
    guild,
    title,
    description,
    color = 0xff0000
) {

    try {

        const channel =
            await guild.channels
                .fetch(LOG_CHANNEL_ID)
                .catch(() => null);

        if (!channel) {

            console.log(
                "❌ ไม่พบห้อง Log"
            );

            return;
        }

        const embed =
            new EmbedBuilder()

                .setTitle(title)

                .setDescription(description)

                .setColor(color)

                .setTimestamp()

                .setFooter({
                    text: "Security System"
                });

        await channel.send({

            embeds: [
                embed
            ]

        });

    } catch (error) {

        console.error(
            "❌ ส่ง Log ไม่สำเร็จ:",
            error.message
        );

    }

}

// ============================================================
// GET MEMBER
// ============================================================

async function getMember(
    guild,
    userId
) {

    return guild.members
        .fetch(userId)
        .catch(() => null);

}

// ============================================================
// QUARANTINE
// ============================================================

async function quarantineMember(
    member,
    reason
) {

    try {

        const guild =
            member.guild;

        const botMember =
            guild.members.me;

        if (!botMember) {

            return false;

        }

        // ----------------------------------------------------
        // หา role กักบริเวณ
        // ----------------------------------------------------

        const quarantineRole =
            guild.roles.cache.get(
                QUARANTINE_ROLE_ID
            );

        if (!quarantineRole) {

            console.log(
                "❌ ไม่พบยศ กักบริเวณ"
            );

            return false;

        }

        // ----------------------------------------------------
        // ป้องกันบอทจัดการตัวเอง
        // ----------------------------------------------------

        if (
            member.id ===
            client.user.id
        ) {

            return false;

        }

        // ----------------------------------------------------
        // ตรวจสอบยศ
        // ----------------------------------------------------

        if (
            member.roles.highest.position >=
            botMember.roles.highest.position
        ) {

            console.log(
                `⚠️ ไม่สามารถจัดการ ${member.user.tag} เพราะยศสูงเกินไป`
            );

            return false;

        }

        // ----------------------------------------------------
        // ถอดยศเดิม
        // ----------------------------------------------------

        const removableRoles =
            member.roles.cache.filter(
                role => {

                    // @everyone
                    if (
                        role.id ===
                        guild.id
                    ) {

                        return false;

                    }

                    // กักบริเวณ
                    if (
                        role.id ===
                        QUARANTINE_ROLE_ID
                    ) {

                        return false;

                    }

                    // ต้องเป็น role ที่บอทจัดการได้
                    return role.editable;

                }
            );

        for (
            const role
            of removableRoles.values()
        ) {

            await member.roles
                .remove(
                    role,
                    "Security System - Quarantine"
                )
                .catch(() => {});

        }

        // ----------------------------------------------------
        // เพิ่มยศกักบริเวณ
        // ----------------------------------------------------

        if (
            !member.roles.cache.has(
                QUARANTINE_ROLE_ID
            )
        ) {

            await member.roles.add(

                quarantineRole,

                reason

            );

        }

        // ----------------------------------------------------
        // LOG
        // ----------------------------------------------------

        await sendLog(

            guild,

            "🔒 กักบริเวณ",

            `👤 ผู้ใช้: ${member}\n` +
            `🆔 ID: ${member.id}\n` +
            `📋 เหตุผล: ${reason}\n` +
            `🎭 ยศที่ได้รับ: ${quarantineRole}`,

            0xff9900

        );

        return true;

    } catch (error) {

        console.error(
            "❌ Quarantine Error:",
            error
        );

        return false;

    }

}

// ============================================================
// ANTI NUKE ACTION
// ============================================================

async function handleNukeAction(
    guild,
    userId,
    action
) {

    if (!userId) {

        return;

    }

    // ป้องกันบอทตัวเอง
    if (
        userId ===
        client.user.id
    ) {

        return;

    }

    const key =
        `${guild.id}:${userId}:${action}`;

    const now =
        Date.now();

    if (!nukeMap.has(key)) {

        nukeMap.set(
            key,
            []
        );

    }

    const actions =
        nukeMap.get(key);

    actions.push(now);

    const recent =
        actions.filter(
            time =>
                now - time <=
                NUKE_WINDOW
        );

    nukeMap.set(
        key,
        recent
    );

    // ยังไม่ถึงจำนวนที่กำหนด
    if (
        recent.length <
        NUKE_LIMIT
    ) {

        return;

    }

    // ล้างก่อนป้องกันการทำซ้ำ
    nukeMap.delete(key);

    const member =
        await getMember(
            guild,
            userId
        );

    if (!member) {

        return;

    }

    await quarantineMember(

        member,

        `Anti-Nuke ตรวจพบ ${action} จำนวน ${recent.length} ครั้งภายใน ${NUKE_WINDOW / 1000} วินาที`

    );

}

// ============================================================
// AUDIT LOG CHECK
// ============================================================

async function getRecentExecutor(
    guild,
    auditType
) {

    try {

        const logs =
            await guild.fetchAuditLogs({

                type: auditType,

                limit: 5

            });

        const now =
            Date.now();

        const entry =
            logs.entries.find(

                entry =>

                    now -
                    entry.createdTimestamp
                    <=
                    5000

                    &&

                    entry.executor

            );

        return (
            entry?.executor ||
            null
        );

    } catch {

        return null;

    }

}

// ============================================================
// ANTI NUKE
// CHANNEL DELETE
// ============================================================

client.on(
    "channelDelete",
    async channel => {

        if (!channel.guild) {

            return;

        }

        const executor =
            await getRecentExecutor(

                channel.guild,

                AuditLogEvent.ChannelDelete

            );

        if (!executor) {

            return;

        }

        await handleNukeAction(

            channel.guild,

            executor.id,

            "ลบห้อง"

        );

    }
);

// ============================================================
// ANTI NUKE
// CHANNEL CREATE
// ============================================================

client.on(
    "channelCreate",
    async channel => {

        if (!channel.guild) {

            return;

        }

        const executor =
            await getRecentExecutor(

                channel.guild,

                AuditLogEvent.ChannelCreate

            );

        if (!executor) {

            return;

        }

        await handleNukeAction(

            channel.guild,

            executor.id,

            "สร้างห้อง"

        );

    }
);

// ============================================================
// ANTI NUKE
// ROLE DELETE
// ============================================================

client.on(
    "roleDelete",
    async role => {

        if (!role.guild) {

            return;

        }

        const executor =
            await getRecentExecutor(

                role.guild,

                AuditLogEvent.RoleDelete

            );

        if (!executor) {

            return;

        }

        await handleNukeAction(

            role.guild,

            executor.id,

            "ลบยศ"

        );

    }
);

// ============================================================
// ANTI NUKE
// ROLE CREATE
// ============================================================

client.on(
    "roleCreate",
    async role => {

        if (!role.guild) {

            return;

        }

        const executor =
            await getRecentExecutor(

                role.guild,

                AuditLogEvent.RoleCreate

            );

        if (!executor) {

            return;

        }

        await handleNukeAction(

            role.guild,

            executor.id,

            "สร้างยศ"

        );

    }
);

// ============================================================
// ANTI NUKE
// BAN
// ============================================================

client.on(
    "guildBanAdd",
    async ban => {

        const executor =
            await getRecentExecutor(

                ban.guild,

                AuditLogEvent.MemberBanAdd

            );

        if (!executor) {

            return;

        }

        await handleNukeAction(

            ban.guild,

            executor.id,

            "แบนสมาชิก"

        );

    }
);

// ============================================================
// ANTI NUKE
// KICK
// ============================================================

client.on(
    "guildMemberRemove",
    async member => {

        const executor =
            await getRecentExecutor(

                member.guild,

                AuditLogEvent.MemberKick

            );

        if (!executor) {

            return;

        }

        await handleNukeAction(

            member.guild,

            executor.id,

            "เตะสมาชิก"

        );

    }
);

// ============================================================
// DISCORD INVITE REGEX
// ============================================================

const discordInviteRegex =
    /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9-]+/i;

// ============================================================
// MESSAGE SYSTEM
// ============================================================

client.on(
    "messageCreate",
    async message => {

        // ----------------------------------------------------
        // ต้องเป็นข้อความใน Server
        // ----------------------------------------------------

        if (!message.guild) {

            return;

        }

        // ----------------------------------------------------
        // ไม่จัดการ Bot
        // ----------------------------------------------------

        if (message.author.bot) {

            return;

        }

        const member =
            message.member;

        if (!member) {

            return;

        }

        // ----------------------------------------------------
        // BOT ROLE
        // ----------------------------------------------------

        const botMember =
            message.guild.members.me;

        // ====================================================
        // ยศใหญ่กว่าหรือเท่าบอท = ยกเว้น
        // ====================================================

        if (

            botMember &&

            member.roles.highest.position >=
            botMember.roles.highest.position

        ) {

            return;

        }

        // ====================================================
        // ANTI DISCORD INVITE
        // ====================================================

        if (
            discordInviteRegex.test(
                message.content
            )
        ) {

            // ------------------------------------------------
            // ลบข้อความ
            // ------------------------------------------------

            await message.delete()
                .catch(() => {});

            // ------------------------------------------------
            // แบนสมาชิก
            // ------------------------------------------------

            try {

                await member.ban({

                    reason:
                        "ส่งลิงก์ Discord Server"

                });

                // --------------------------------------------
                // LOG
                // --------------------------------------------

                await sendLog(

                    message.guild,

                    "🔨 แบนสมาชิก",

                    `👤 ผู้ใช้: ${member}\n` +
                    `🆔 ID: ${member.id}\n` +
                    `🔗 เหตุผล: ส่งลิงก์ Discord Server\n` +
                    `💬 ข้อความ: ${message.content}`,

                    0xff0000

                );

            } catch (error) {

                console.error(

                    "❌ Ban Error:",

                    error.message

                );

            }

            return;

        }

        // ====================================================
        // ANTI SPAM
        // ====================================================

        const userId =
            message.author.id;

        const now =
            Date.now();

        // ----------------------------------------------------
        // สร้างข้อมูลผู้ใช้
        // ----------------------------------------------------

        if (!spamMap.has(userId)) {

            spamMap.set(
                userId,
                []
            );

        }

        const messages =
            spamMap.get(userId);

        // ----------------------------------------------------
        // เก็บข้อความ + เวลา
        // ----------------------------------------------------

        messages.push({

            time: now,

            message: message

        });

        // ----------------------------------------------------
        // เอาเฉพาะข้อความใน 15 วินาที
        // ----------------------------------------------------

        const recentMessages =
            messages.filter(

                item =>
                    now - item.time
                    <=
                    SPAM_WINDOW

            );

        spamMap.set(

            userId,

            recentMessages

        );

        // ====================================================
        // เกิน 5 ข้อความ
        // ====================================================

        if (
            recentMessages.length >
            SPAM_LIMIT
        ) {

            // ------------------------------------------------
            // ล้างข้อมูล Spam
            // ------------------------------------------------

            spamMap.delete(
                userId
            );

            // ------------------------------------------------
            // ลบข้อความสแปมทั้งหมด
            // ------------------------------------------------

            for (
                const item
                of recentMessages
            ) {

                if (
                    item.message
                ) {

                    await item.message
                        .delete()
                        .catch(() => {});

                }

            }

            // ------------------------------------------------
            // TIMEOUT 10 นาที
            // ------------------------------------------------

            try {

                await member.timeout(

                    SPAM_TIMEOUT,

                    "ส่งข้อความสแปมเกิน 5 ข้อความภายใน 15 วินาที"

                );

                // --------------------------------------------
                // LOG
                // --------------------------------------------

                await sendLog(

                    message.guild,

                    "🚫 Anti-Spam",

                    `👤 ผู้ใช้: ${member}\n` +
                    `🆔 ID: ${member.id}\n` +
                    `🗑️ ลบข้อความสแปม: ${recentMessages.length} ข้อความ\n` +
                    `📊 จำนวน: เกิน 5 ข้อความ\n` +
                    `⏱️ ช่วงเวลา: 15 วินาที\n` +
                    `🔒 Timeout: 10 นาที`,

                    0xff6600

                );

            } catch (error) {

                console.error(

                    "❌ Timeout Error:",

                    error.message

                );

            }

        }

    }
);

// ============================================================
// BOT READY
// ============================================================

client.once(
    "clientReady",
    async () => {

        console.log(
            "======================================"
        );

        console.log(
            "🛡️ SECURITY SYSTEM ONLINE"
        );

        console.log(
            "======================================"
        );

        console.log(
            `🤖 Bot: ${client.user.tag}`
        );

        console.log(
            `🌐 Servers: ${client.guilds.cache.size}`
        );

        // ----------------------------------------------------
        // หา Server
        // ----------------------------------------------------

        const guild =
            client.guilds.cache.get(
                GUILD_ID
            );

        if (!guild) {

            console.log(
                "❌ ไม่พบบอทใน GUILD_ID ที่กำหนด"
            );

            return;

        }

        console.log(
            `🏠 Server: ${guild.name}`
        );

        // ----------------------------------------------------
        // หา Role
        // ----------------------------------------------------

        const quarantineRole =
            guild.roles.cache.get(

                QUARANTINE_ROLE_ID

            );

        if (!quarantineRole) {

            console.log(
                "❌ ไม่พบยศ กักบริเวณ"
            );

        } else {

            console.log(

                `🔒 Quarantine Role: ${quarantineRole.name}`

            );

        }

        // ----------------------------------------------------
        // ตรวจสอบ Log Channel
        // ----------------------------------------------------

        const logChannel =
            guild.channels.cache.get(
                LOG_CHANNEL_ID
            );

        if (!logChannel) {

            console.log(
                "❌ ไม่พบห้อง Log"
            );

        } else {

            console.log(
                `📋 Log Channel: ${logChannel.name}`
            );

        }

        console.log(
            "======================================"
        );

        console.log(
            "🚫 Anti-Spam : ON"
        );

        console.log(
            "🗑️ Spam Delete : ON"
        );

        console.log(
            "⏱️ Spam Timeout : 10 นาที"
        );

        console.log(
            "🔗 Anti-Discord Invite : ON"
        );

        console.log(
            "🛡️ Anti-Nuke : ON"
        );

        console.log(
            "======================================"
        );

    }
);

// ============================================================
// ERROR HANDLER
// ============================================================

client.on(
    "error",
    error => {

        console.error(
            "Discord Client Error:",
            error
        );

    }
);

// ============================================================
// UNHANDLED REJECTION
// ============================================================

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "Unhandled Rejection:",
            error
        );

    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
    TOKEN
);
