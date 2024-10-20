const tmi = require('tmi.js');
const axios = require('axios');

// Environment variables
const twitchChannel = process.env.TWITCH_CHANNEL;
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

if (!twitchChannel || !discordWebhookUrl) {
    console.error('Please provide the required environment variables TWITCH_CHANNEL and DISCORD_WEBHOOK_URL.');
    process.exit(1);
}

let messages = [];

// Create a Twitch client
const client = new tmi.Client({
    channels: [twitchChannel]
});

// Connect to Twitch
client.connect().catch(console.error);

// Event: when a message is received in the chat
client.on('message', (channel, tags, message, self) => {
    if (self) return; // Ignore messages from the bot itself

    const log = {
        username: tags['display-name'] || tags['username'],
        message,
        timestamp: new Date().toISOString()
    };

    messages.push(log);
});

// Handle subscriptions, bits, and follows
client.on('subscription', (channel, username) => {
    messages.push({ 
        event: 'subscription', 
        username, 
        timestamp: new Date().toISOString() 
    });
});

client.on('cheer', (channel, userstate, message) => {
    messages.push({ 
        event: 'cheer', 
        username: userstate['display-name'], 
        bits: userstate['bits'], 
        message, 
        timestamp: new Date().toISOString() 
    });
});

// Send messages to Discord every 5 seconds
setInterval(() => {
    if (messages.length > 0) {
        const batch = messages.splice(0, messages.length);  // Get all messages in one batch

        // Format all messages in a single payload
        const formattedMessages = batch.map(msg => {
            if (msg.event === 'subscription') {
                return `**${msg.username}** has subscribed!`;
            } else if (msg.event === 'cheer') {
                return `**${msg.username}** cheered with ${msg.bits} bits: ${msg.message}`;
            } else {
                return `**${msg.username}**: ${msg.message}`;
            }
        }).join('\n');  // Combine messages into a single string

        // Create the payload to send to Discord
        const payload = {
            username: "Twitch",
            embeds: [
                {
                    description: formattedMessages,  // All the messages together
                    color: 0x9146FF,  // Purple color (Twitch signature)
                    timestamp: new Date().toISOString()  // Use the current timestamp for the batch
                }
            ]
        };

        axios.post(discordWebhookUrl, payload)
            .then(() => {
                console.log(`Sent batch of ${batch.length} messages to Discord.`);
            })
            .catch(console.error);
    }
}, 5000);  // Send every 5 seconds
