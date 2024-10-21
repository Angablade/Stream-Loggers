const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios'); // For sending HTTP requests to Discord Webhook

// Use stealth plugin to prevent detection
puppeteer.use(StealthPlugin());

const YoutubeChannel = process.env.YOUTUBE_CHANNEL || 'example_channel'; // Example channel name
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || 'YOUR_DISCORD_WEBHOOK_URL'; // Set your Discord Webhook URL

(async () => {
    // Function to extract YouTube Video ID
    const getYoutubeVideoId = async (page, YoutubeChannel) => {
        await page.goto(`https://www.youtube.com/@${YoutubeChannel}/streams`);
        const content = await page.content();
        const match = content.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    };

    // Launch the browser
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let videoId = null;
    const page = await browser.newPage();
    
    // Initial Video ID fetch
    videoId = await getYoutubeVideoId(page, YoutubeChannel);
    console.log(`Watching YouTube Video ID: ${videoId}`);

    let oldChatEntryCount = 0;
    let messageBatch = [];  // Array to store messages for batching

    // Send batch of messages every 5 seconds
    setInterval(async () => {
        if (messageBatch.length > 0) {
            try {
                const embed = {
                    username: 'youtube',
                    embeds: messageBatch.map(msg => ({
                        color: 15548997, // Red border
                        description: `${msg.username}: ${msg.message}`,
                        timestamp: new Date().toISOString(),
                    }))
                };

                await axios.post(discordWebhookUrl, embed);
                console.log(`Sent batch of ${messageBatch.length} messages to Discord.`);
            } catch (error) {
                console.error('Error sending batch to Discord:', error);
            }
            messageBatch = []; // Clear the batch after sending
        }
    }, 5000);  // 5 seconds interval for batching

    // Check for new streams every 5 minutes
    setInterval(async () => {
        try {
            const newVideoId = await getYoutubeVideoId(page, YoutubeChannel);
            if (newVideoId && newVideoId !== videoId) {
                videoId = newVideoId;
                console.log(`New stream detected: ${videoId}`);
                await page.goto(`https://www.youtube.com/live_chat?v=${videoId}`);
                oldChatEntryCount = 0;  // Reset the count when a new stream starts
            }
        } catch (err) {
            console.error('Error checking for new stream:', err);
        }
    }, 5 * 60 * 1000); // Check every 5 minutes

    while (true) {
        try {
            if (videoId) {
                // Attempt to load the live chat
                await page.goto(`https://www.youtube.com/live_chat?v=${videoId}`);
                
                // Wait for chat entries to load
                await page.waitForSelector('yt-live-chat-text-message-renderer', { timeout: 10000 });
                const chatEntries = await page.$$('yt-live-chat-text-message-renderer'); // Query all chat entries

                const newChatEntryCount = chatEntries.length;

                if (newChatEntryCount > oldChatEntryCount) {
                    for (let i = oldChatEntryCount; i < newChatEntryCount; i++) {
                        const entry = chatEntries[i];

                        // Get username
                        const usernameElement = await entry.$('#author-name');
                        if (!usernameElement) continue;

                        const usernameText = await (await usernameElement.getProperty('innerText')).jsonValue();

                        // Get chat message
                        const messageElement = await entry.$('#message');
                        if (!messageElement) continue;

                        const messageText = await (await messageElement.getProperty('innerText')).jsonValue();

                        // Add the message to the batch
                        messageBatch.push({ username: usernameText, message: messageText });
                        console.log(`Collected message: ${usernameText}: ${messageText}`);
                    }

                    oldChatEntryCount = newChatEntryCount;
                }
            }
        } catch (err) {
            if (err.name === 'TimeoutError') {
                // Suppress logging for timeouts, as they occur when there's no live stream or chat
                console.log('No live chat messages found (timeout).');
            } else {
                console.error('Error fetching chat:', err);
            }

            // Optional: wait before trying again to avoid constant retries in case of errors
            await new Promise(r => setTimeout(r, 10000)); // Wait 10 seconds
        }

        // Small delay to prevent constant scraping
        await new Promise(r => setTimeout(r, 530));
    }

    await browser.close();
})();
