const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const cloudscraper = require("cloudscraper");
const fs = require("fs");
const path = require("path");


// ------------------------
// Configuration
// ------------------------
const API_KEY = "96a1b1d6cbefcbe02d42d71941f7d0570e69cd0f54e6c8538c34d2432098caa5";
const API_URL = "https://jtsmmpanel.com/adminapi/v1";

// Admin numbers who can set users
const authorizedAdmins = ["13031266349112"];

// Provider to WhatsApp group mapping
const providerGroups = {
   "Perfect Smm": "120363419612172337@g.us",
   "Smm Gen": "120363304718684578@g.us",
   "Techsmm": "120363390878435592@g.us",
   "Rush": "120363386001249747@g.us",
   "prov3": "120363405214053495@g.us",
    "xserv": "120363398961873228@g.us",
    "mabdsmm": "120363420992257972@g.us",
    "bulk": "120363400207919972@g.us",
    "subre": "120363419656380075@g.us",

};





// File to save group usernames persistently
const dataFile = path.join(__dirname, "groupUsers.json");
const groupUsers = {};

// Load saved usernames
if (fs.existsSync(dataFile)) {
    const savedData = fs.readFileSync(dataFile);
    Object.assign(groupUsers, JSON.parse(savedData));
    console.log("✅ Loaded saved group usernames:", groupUsers);
}

// Helper to save usernames
function saveGroupUsers() {
    fs.writeFileSync(dataFile, JSON.stringify(groupUsers, null, 2));
}

// ------------------------
// Initialize WhatsApp Client
// ------------------------
const puppeteer = require("puppeteer");

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "jtsmm-bot" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: puppeteer.executablePath()
  }
});


client.on("qr", qr => {
    console.log("📱 Scan this QR code to login:");
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("✅ WhatsApp Bot is ready!");
});

client.initialize();

// ------------------------
// Message handler
// ------------------------
client.on("message", async msg => {
    const originalText = msg.body.trim();
    const text = originalText.toLowerCase();
    const from = msg.from;
    const isGroup = from.endsWith("@g.us");
    

    // Determine sender number
    let senderNumber;
    if (isGroup) {
        if (!msg.author) return;
        senderNumber = msg.author.split("@")[0];
    } else {
        senderNumber = from.split("@")[0];
    }









 // ------------------------
// Restrict bot to only work in groups with /setuser
// ------------------------

// Ignore private messages (no DM replies at all)
if (!isGroup) return;


 // ------------------------
    // /setuser command
    // ------------------------
    if (isGroup && text.startsWith("/setuser ")) {
        if (!authorizedAdmins.includes(senderNumber)) {
            return msg.reply("❌ You are not authorized to set username.");
        }
        const username = text.replace("/setuser ", "").trim();
        if (!username) return msg.reply("❌ Please provide a username. Usage: /setuser <username>");
        groupUsers[from] = username.toLowerCase();
        saveGroupUsers();
        return msg.reply(`✅ Username for this group set to: ${username}`);
    }



// If it's a group but no username set, ignore silently
if (!groupUsers[from]) return;
   



   

    // ------------------------
    // Refill command detection
    // ------------------------
    // ------------------------
// ------------------------
// Refill command detection (grouped replies + grouped provider messages)
// ------------------------
const refillRegex = /\brefill\b[:\s]*|refill/i;
if (refillRegex.test(originalText)) {
    const refillIdsRaw = originalText.match(/\b\d+\b/g);
    if (!refillIdsRaw || !refillIdsRaw.length) return msg.reply("⚠️ No order IDs found for refill.");
    const refillIds = [...new Set(refillIdsRaw.map(id => id.trim()))];

    const groupUsername = isGroup ? groupUsers[from] : null;
    if (isGroup && !groupUsername) {
        return msg.reply("❌ No username set for this group. Admin must run /setuser <username>");
    }
    const usernameNormalized = groupUsername?.trim().toLowerCase();

    try {
            const response = await cloudscraper.get({
                uri: API_URL,
                qs: {
                    key: API_KEY,
                    action: "getOrders-by-id",
                    orders: refillIds.join(","),
                    provider: 1
                },
                json: true
            });

            const data = response;
            if (data.status !== "success" || !data.orders || !data.orders.length) {
                return msg.reply("⚠️ No orders found for refill.");
            }


        // ------------------------
        // Group orders by result type
        // ------------------------
        const groupedReplies = {
            noRefill: [],
            applied: [],
            expired: [],
            notYourOrder: [],
            statusBlocked: {} // key = status text, value = array of order IDs
        };



        const providerMessages = {}; // key = groupId, value = array of external_ids

        for (const o of data.orders) {
            const oUsername = o.username.trim().toLowerCase();
            const status = o.order_status.toLowerCase();


        


            // Ownership check
            if (usernameNormalized && oUsername !== usernameNormalized) {
                groupedReplies.notYourOrder.push(o.id);
                continue;
            }


 

            // Only completed orders can be refilled




            if (status !== "completed") {
                let msgText = "";
                if (status === "cancelled" || status === "canceled") {
                    msgText = `${o.id} - Cancelled (Cancelled orders cant refill)`;
                } else if (status === "partial") {
                    msgText = `${o.id} - Already Partialled (Partialled orders cant refill)`;
                } else if (status === "in progress") {
                    msgText = `${o.id} - Order is in progress, cant refill`;
                } else {
                    msgText = `${o.id} - ${o.order_status} (cant refill)`;
                }
                if (!groupedReplies.statusBlocked[msgText]) groupedReplies.statusBlocked[msgText] = [];
                groupedReplies.statusBlocked[msgText].push(o.id);
                continue;
            }

            const serviceName = o.service;
            const provider = o.provider;
            const groupId = providerGroups[provider];
            const orderDate = new Date(o.date);
            const currentDate = new Date(o.current_date);

            


            if (/No Refill/i.test(serviceName)) {
                groupedReplies.noRefill.push(o.id);
                continue;
            }

            const refillMatch = serviceName.match(/(\d+)D Refill/i);
            let refillDays = 0;
            if (refillMatch) refillDays = parseInt(refillMatch[1]);
            if (/Lifetime Refill/i.test(serviceName)) refillDays = Infinity;

            if (refillDays > 0) {
                const diffTime = Math.floor((currentDate - orderDate) / (1000 * 60 * 60 * 24));
                if (diffTime <= refillDays) {
                    // Collect provider messages
                    if (groupId) {
                        if (!providerMessages[groupId]) providerMessages[groupId] = [];
                        providerMessages[groupId].push(o.external_id);
                    }
                    groupedReplies.applied.push(o.id);
                } else {
                    groupedReplies.expired.push(o.id);
                }
            }
        }


        

        // ------------------------
        // Send grouped messages to providers
        // ------------------------
        for (const groupId in providerMessages) {
            const ids = providerMessages[groupId];
            await client.sendMessage(groupId, `${ids.join(", ")} refill`);
        }

        // ------------------------
        // Build reply messages for user
        // ------------------------
        const replyMessages = [];
        if (groupedReplies.noRefill.length) replyMessages.push(`${groupedReplies.noRefill.join(", ")} - No Refill Service`);
        if (groupedReplies.applied.length) replyMessages.push(`${groupedReplies.applied.join(", ")} - Applied For Refill`);
        if (groupedReplies.expired.length) replyMessages.push(`${groupedReplies.expired.join(", ")} - Refill expired`);
        if (groupedReplies.notYourOrder.length) replyMessages.push(`❌ ${groupedReplies.notYourOrder.join(", ")} - Not your order`);

        // Add blocked statuses individually
        for (const statusMsg in groupedReplies.statusBlocked) {
            replyMessages.push(statusMsg);
        }

        if (replyMessages.length) await msg.reply(replyMessages.join("\n"));

    } catch (err) {
            console.error(err);
            await msg.reply("⚠️ Something went wrong while processing refill.");
        }

    return; // stop further processing for this message
}



// ------------------------
// Fake Complete command detection (grouped replies + grouped provider messages)
// ------------------------
const fakeCompleteRegex = /\bfake complete\b[:\s]*|fake complete/i;
if (fakeCompleteRegex.test(originalText)) {
    const fakeIdsRaw = originalText.match(/\b\d+\b/g);
    if (!fakeIdsRaw || !fakeIdsRaw.length) return msg.reply("⚠️ No order IDs found for fake complete.");
    const fakeIds = [...new Set(fakeIdsRaw.map(id => id.trim()))];

    const groupUsername = isGroup ? groupUsers[from] : null;
    if (isGroup && !groupUsername) {
        return; // silently ignore if no username set for this group
    }
    const usernameNormalized = groupUsername?.trim().toLowerCase();

    try {
            const response = await cloudscraper.get({
                uri: API_URL,
                qs: {
                    key: API_KEY,
                    action: "getOrders-by-id",
                    orders: fakeIds.join(","),
                    provider: 1
                },
                json: true
            });

            const data = response;
            if (data.status !== "success" || !data.orders || !data.orders.length) {
                return msg.reply("⚠️ No orders found for fake complete.");
            }

        // ------------------------
        // Group orders by result type (store IDs, not formatted strings)
        // ------------------------
        const groupedReplies = {
            applied: [],       // IDs that will be applied (Completed)
            notCompleted: [],  // IDs that are in progress/pending
            cancelled: [],     // IDs that are cancelled
            partial: [],       // IDs that are partialled
            otherStatus: [],   // fallback: store formatted strings here
            notYourOrder: []   // IDs not owned by this group/user
        };

        const providerMessages = {}; // key = groupId, value = array of external_ids

        for (const o of data.orders) {
            const oUsername = o.username.trim().toLowerCase();
            const status = (o.order_status || "").toLowerCase();
            const provider = o.provider;
            const groupId = providerGroups[provider];

            // Ownership check
            if (usernameNormalized && oUsername !== usernameNormalized) {
                groupedReplies.notYourOrder.push(o.id);
                continue;
            }

            // Status checks (group IDs)






            if (status === "completed") {
                // Collect provider external IDs grouped by provider group
                if (groupId) {
                    if (!providerMessages[groupId]) providerMessages[groupId] = [];
                    providerMessages[groupId].push(o.external_id);
                }
                groupedReplies.applied.push(o.id);

            } else if (status === "in progress" || status === "pending") {
                groupedReplies.notCompleted.push(o.id);

            } else if (status === "canceled" || status === "cancelled") {
                groupedReplies.cancelled.push(o.id);

            } else if (status === "partial") {
                groupedReplies.partial.push(o.id);

            } else {
                // Any other unknown status — keep as formatted fallback line
                groupedReplies.otherStatus.push(`${o.id} - Status: ${o.order_status}`);
            }
        }

        // ------------------------
        // Send grouped messages to providers (one message per provider group)
        // ------------------------
        for (const groupId in providerMessages) {
            const ids = providerMessages[groupId];
            if (ids && ids.length) {
                await client.sendMessage(groupId, `${ids.join(", ")} fake complete`);
            }
        }


        // ------------------------
        // Build grouped reply messages for user (with blank line between groups)
        // ------------------------
        const replyMessages = [];

        if (groupedReplies.applied.length) {
            replyMessages.push(`${groupedReplies.applied.join(", ")} - Applied For Solution`);
        }
        if (groupedReplies.notCompleted.length) {
            replyMessages.push(`${groupedReplies.notCompleted.join(", ")} - Order is not completed`);
        }
        if (groupedReplies.cancelled.length) {
            replyMessages.push(`${groupedReplies.cancelled.join(", ")} - Order is already cancelled and refunded`);
        }
        if (groupedReplies.partial.length) {
            replyMessages.push(`${groupedReplies.partial.join(", ")} - Order is already partialled`);
        }



        // fallback lines (already formatted)
        if (groupedReplies.otherStatus.length) {
            replyMessages.push(...groupedReplies.otherStatus);
        }
        if (groupedReplies.notYourOrder.length) {
            replyMessages.push(`❌ ${groupedReplies.notYourOrder.join(", ")} - Not your order`);
        }

        if (replyMessages.length) {
            // use double newline between groups to match your requested format
            await msg.reply(replyMessages.join("\n\n"));
        }

    } catch (err) {
            console.error(err);
            await msg.reply("⚠️ Something went wrong while processing fake complete.");
        }

  
    return; // stop further processing for this message
}





    // ------------------------
    // Detect action in natural message (speed / cancel)
    // ------------------------
    let action = null;
    if (text.includes("cancel")) action = "cancel";
    else if (text.includes("speed up")) action = "speed up";
    else if (text.includes("speed")) action = "speed";

    if (!action) return; // Nothing to do

    // ------------------------
    // Extract numeric order IDs
    // ------------------------
    const normalizedText = text.replace(/[^a-z0-9\s,]/gi, " "); // remove special chars
    const orderIdsRaw = normalizedText.match(/\b\d+\b/g);
    if (!orderIdsRaw || !orderIdsRaw.length) return msg.reply("⚠️ No order IDs found in your message.");
    const orderIds = [...new Set(orderIdsRaw.map(id => id.trim()))]; // unique

    // ------------------------
    // Check group username
    // ------------------------
    const groupUsername = isGroup ? groupUsers[from] : null;
    if (isGroup && !groupUsername) {
        return msg.reply("❌ No username set for this group. Admin must run /setuser <username>");
    }
    const usernameNormalized = groupUsername?.trim().toLowerCase();

    try {
        const response = await cloudscraper.get({
            uri: API_URL,
            qs: {
                key: API_KEY,
                action: "getOrders-by-id",
                orders: orderIds.join(","),
                provider: 1
            },
            json: true
        });

        const data = response;
        if (data.status !== "success" || !data.orders || !data.orders.length) {
            return msg.reply("⚠️ No orders found.");
        }

        // ------------------------
        // Process orders
        // ------------------------
        const statusGroups = { completed: [], partial: [], cancelled: [] };
        const notAllowedOrders = [];
        const providerMessages = {};
        const appliedOrders = [];

        data.orders.forEach(o => {
            const oUsername = o.username.trim().toLowerCase();
            const status = o.order_status.toLowerCase();


    

            // Ownership check
            if (usernameNormalized && oUsername !== usernameNormalized) {
                notAllowedOrders.push(o.id);
                return;
            }


            if (status === "completed") statusGroups.completed.push(o.id);
            else if (status === "partial") statusGroups.partial.push(o.id);
            else if (status === "canceled" || status === "cancelled") statusGroups.cancelled.push(o.id);
            else if (status === "in progress") {
                const provider = o.provider;
                const groupId = providerGroups[provider];
                if (!groupId) return;
                if (!providerMessages[groupId]) providerMessages[groupId] = [];
                providerMessages[groupId].push(o.external_id);
                appliedOrders.push(o.id);
            } else {
                appliedOrders.push(`${o.id} - status: ${o.order_status}`);
            }
        });

        // ------------------------
        // Send messages to provider groups
        // ------------------------
        for (const groupId in providerMessages) {
            const ids = providerMessages[groupId];
            const cmdText = `${ids.join(", ")} ${action}`;
            await client.sendMessage(groupId, cmdText);
        }

        // ------------------------
        // Reply to user once
        // ------------------------
        const replyMessages = [];
        if (statusGroups.completed.length) replyMessages.push(`${statusGroups.completed.join(", ")} - already completed`);
        if (statusGroups.partial.length) replyMessages.push(`${statusGroups.partial.join(", ")} - already partialled`);
        if (statusGroups.cancelled.length) replyMessages.push(`${statusGroups.cancelled.join(", ")} - already cancelled`);
        if (appliedOrders.length) {
            const actionText = action === "speed" ? "applied for speed up" : `applied for ${action}`;
            replyMessages.push(`${appliedOrders.join(", ")} - ${actionText}`);
        }
        if (notAllowedOrders.length) replyMessages.push(`❌ ${notAllowedOrders.join(", ")} - not your order`);

        if (replyMessages.length) await msg.reply(replyMessages.join("\n"));

    } catch (err) {
        console.error(err);
        await msg.reply("⚠️ Something went wrong while processing orders.");
    }
});



