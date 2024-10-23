const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios'); // For sending HTTP requests to Discord Webhook

// Use stealth plugin to prevent detection
puppeteer.use(StealthPlugin());

const kickChannel = process.env.KICK_CHANNEL || 'example_channel'; // Example channel name
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || 'YOUR_DISCORD_WEBHOOK_URL'; // Set your Discord Webhook URL

if (!kickChannel || !discordWebhookUrl) {
    console.error('Please provide the required environment variables KICK_CHANNEL and DISCORD_WEBHOOK_URL.');
    process.exit(1);
}

let messageBatch = [];  // Batch of messages to send
const desiredUrl = `https://kick.com/${kickChannel}/chatroom`;

(async () => {
    // Launch the browser
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: [
            '--window-size=1366,768',
            '--disable-infobars',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--enable-widevine-cdm',
        ]
    });

    const page = await browser.newPage();
    await page.goto(desiredUrl);

    let oldChatEntryCount = 0;
    let lastUrlCheckTime = Date.now();
    const urlCheckInterval = 30 * 1000; // 30 seconds
    const refreshInterval = 12 * 60 * 60 * 1000; // 12 hours
    let lastRefreshTime = Date.now();

    // Main loop to fetch chat messages and check for URL change
    while (true) {
        try {
            const currentTime = Date.now();

            // Check if it's time to check the URL (every 30 seconds)
            if (currentTime - lastUrlCheckTime >= urlCheckInterval) {
                lastUrlCheckTime = currentTime;

                // Check if the URL has changed
                const currentUrl = page.url();
                if (currentUrl !== desiredUrl) {
                    console.warn(`URL changed! Navigating back to ${desiredUrl}`);
                    await page.goto(desiredUrl); // Navigate back to the desired URL
                    oldChatEntryCount = 0; // Reset chat entry count after navigating back
                }
            }

            // Check if it's time to refresh the page (every 12 hours)
            if (currentTime - lastRefreshTime >= refreshInterval) {
                lastRefreshTime = currentTime;
                console.log(`Refreshing the page after 12 hours.`);
                await page.reload(); // Refresh the page
                oldChatEntryCount = 0; // Reset chat entry count after refreshing

                // Send a message to Discord that the page was reloaded
                const reloadMessage = {
                    username: 'kick',
                    embeds: [
                        {
                            color: 3066993,
                            description: `The page has been reloaded after 12 hours to ensure proper operation.`,
                            timestamp: new Date().toISOString()
                        }
                    ]
                };

                axios.post(discordWebhookUrl, reloadMessage)
                    .then(() => {
                        console.log('Sent reload notification to Discord.');
                    })
                    .catch((error) => {
                        console.error('Error sending reload notification to Discord:', error);
                    });
            }

            // Wait for chat entries to appear
            await page.waitForSelector('.chat-entry', { timeout: 10000 });
            const chatEntries = await page.$$('.chat-entry'); // Query all chat entries
            const newChatEntryCount = chatEntries.length;

            if (newChatEntryCount > oldChatEntryCount) {
                // Process new chat entries
                for (let i = oldChatEntryCount; i < newChatEntryCount; i++) {
                    const entry = chatEntries[i];

                    // Get username
                    const usernameElement = await entry.$('.chat-entry-username');
                    const usernameText = await (await usernameElement.getProperty('innerText')).jsonValue();

                    // Get chat messages
                    const messageElements1 = await entry.$$('.chat-entry-content');
                    const messageElements2 = await entry.$$('.break-all');

                    let messageParts = [];
                    for (const messageElement of [...messageElements1, ...messageElements2]) {
                        let messageText = await (await messageElement.getProperty('innerText')).jsonValue();

                        // Get and replace links
                        const links = await messageElement.$$('a');
                        for (const link of links) {
                            const linkHref = await (await link.getProperty('href')).jsonValue();
                            const linkText = await (await link.getProperty('innerText')).jsonValue();
                            messageText = messageText.replace(linkText, linkHref);
                        }
                        messageParts.push(messageText.trim());
                    }

                    const fullUsername = usernameText.toLowerCase();
                    const fullMessage = messageParts.join(' ');

                    // Add message to batch
                    messageBatch.push({
                        username: fullUsername,
                        message: fullMessage,
                        timestamp: new Date().toISOString()
                    });
                }

                oldChatEntryCount = newChatEntryCount;
            }

            // Small delay to prevent constant scraping
            await new Promise(r => setTimeout(r, 530));
        } catch (err) {
            console.error('Error fetching chat:', err);
            // Optional: Handle the error and retry
        }
    }

    await browser.close();
})();

// Send messages to Discord every 5 seconds
setInterval(() => {
    if (messageBatch.length > 0) {
        // Combine all messages in the batch into a single message
        const formattedMessages = messageBatch.map(msg => {
            return `**${msg.username}**: ${msg.message}`;
        }).join('\n');

        // Create the payload to send to Discord
        const payload = {
            username: 'kick',
            embeds: [
                {
                    color: 3066993,  // Green border
                    description: formattedMessages,  // All messages in one payload
                    timestamp: new Date().toISOString()  // Use current timestamp for the batch
                }
            ]
        };

        // Send the batch of messages to Discord
        axios.post(discordWebhookUrl, payload)
            .then(() => {
                console.log(`Sent batch of ${messageBatch.length} messages to Discord.`);
                messageBatch = [];  // Clear the batch after sending
            })
            .catch((error) => {
                console.error('Error sending batch to Discord:', error);
            });
    }
}, 5000);  // Send every 5 seconds
