const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

// Use stealth plugin to prevent detection
puppeteer.use(StealthPlugin());

const YoutubeChannel = process.env.YOUTUBE_CHANNEL || 'example_channel'; // Example channel name
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || 'YOUR_DISCORD_WEBHOOK_URL'; // Set your Discord Webhook URL

(async () => {
    const getYoutubeVideoId = async (page, YoutubeChannel) => {
        await page.goto(`https://www.youtube.com/@${YoutubeChannel}/streams`);
        const content = await page.content();
        const match = content.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    };

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    let videoId = await getYoutubeVideoId(page, YoutubeChannel);
    console.log(`Watching YouTube Video ID: ${videoId}`);

    let oldChatEntryCount = 0;
    let messageBatch = []; // Array to store messages for batching

    // Send batch of messages every 5 seconds
    setInterval(async () => {
        if (messageBatch.length > 0) {
            try {
                const embed = {
                    username: 'youtube',
                    embeds: [{
                        color: 15548997,
                        description: messageBatch.join('\n'), // Join messages with new lines
                        timestamp: new Date().toISOString(),
                    }]
                };
                await axios.post(discordWebhookUrl, embed);
                console.log(`Sent batch of ${messageBatch.length} messages to Discord.`);
                messageBatch = []; // Clear batch after sending
            } catch (error) {
                console.error('Error sending batch to Discord:', error);
            }
        } else {
            console.log('No new messages to send.');
        }
    }, 5000); // Adjusted to send every 5 seconds

    // Check for new streams every 5 minutes
    setInterval(async () => {
        try {
            const newVideoId = await getYoutubeVideoId(page, YoutubeChannel);
            if (newVideoId && newVideoId !== videoId) {
                videoId = newVideoId;
                console.log(`New stream detected: ${videoId}`);
                await page.goto(`https://www.youtube.com/live_chat?v=${videoId}`);
                oldChatEntryCount = 0; // Reset the count when a new stream starts
                await switchToLiveChat(page); // Ensure Live Chat is selected
            }
        } catch (err) {
            console.error('Error checking for new stream:', err);
        }
    }, 5 * 60 * 1000); // Check every 5 minutes

    // Check if URL changes every 30 seconds and reset it
    setInterval(async () => {
        try {
            const currentUrl = await page.url();
            const expectedUrl = `https://www.youtube.com/live_chat?v=${videoId}`;
            if (currentUrl !== expectedUrl) {
                console.log(`URL changed! Resetting to: ${expectedUrl}`);
                await page.goto(expectedUrl);
                await switchToLiveChat(page); // Ensure Live Chat is selected
            }
        } catch (err) {
            console.error('Error checking/resetting URL:', err);
        }
    }, 30 * 1000); // Check every 30 seconds

    // Refresh the page every 12 hours
    setInterval(async () => {
        console.log('Refreshing the page...');
        await page.reload();
        await switchToLiveChat(page); // Ensure Live Chat is selected
    }, 12 * 60 * 60 * 1000); // 12 hours

    // Switch to Live Chat on page load
    const switchToLiveChat = async (page) => {
        try {
            await page.waitForSelector('tp-yt-paper-listbox');
            await page.evaluate(() => {
                const liveChatButton = [...document.querySelectorAll('tp-yt-paper-item')].find(item =>
                    item.innerText.includes('Live chat'));
                if (liveChatButton) liveChatButton.click();
            });
            console.log('Switched to Live Chat');
        } catch (err) {
            console.error('Error switching to Live Chat:', err);
        }
    };

    // Start watching the live chat
    while (true) {
        try {
            if (videoId) {
                try {
                    await page.goto(`https://www.youtube.com/live_chat?v=${videoId}`);
                    await switchToLiveChat(page); // Ensure Live Chat is selected on page load
                    await page.waitForSelector('yt-live-chat-text-message-renderer', { timeout: 10000 });

                    const chatEntries = await page.$$('yt-live-chat-text-message-renderer'); // Get chat entries
                    const newChatEntryCount = chatEntries.length;

                    // Process new chat entries
                    if (newChatEntryCount > oldChatEntryCount) {
                        for (let i = oldChatEntryCount; i < newChatEntryCount; i++) {
                            const entry = chatEntries[i];

                            // Get username
                            const usernameElement = await entry.$('#author-name');
                            if (!usernameElement) continue;

                            const usernameText = await (await usernameElement.getProperty('innerText')).jsonValue();

                            // Check if the message is a donation, subscriber, or another special event
                            let messageText = '';
                            const isDonation = await entry.$('yt-live-chat-paid-message-renderer') !== null;
                            const isMember = await entry.$('yt-live-chat-membership-item-renderer') !== null;

                            if (isDonation) {
                                const donationElement = await entry.$('yt-live-chat-paid-message-renderer #purchase-amount');
                                const donationAmount = await (await donationElement.getProperty('innerText')).jsonValue();
                                const donationMessageElement = await entry.$('#message');
                                const donationMessage = donationMessageElement ? await (await donationMessageElement.getProperty('innerText')).jsonValue() : 'No message';
                                messageText = `💰 **Donation** from **${usernameText}**: ${donationAmount}\n${donationMessage}`;
                            } else if (isMember) {
                                messageText = `🎉 **New Member**: ${usernameText} has joined as a channel member!`;
                            } else {
                                const messageElement = await entry.$('#message');
                                if (!messageElement) continue;
                                const message = await (await messageElement.getProperty('innerText')).jsonValue();
                                messageText = `**${usernameText}**: ${message}`;
                            }

                            messageBatch.push(messageText); // Add the formatted message to the batch
                            console.log(`Collected message: ${messageText}`);
                        }

                        // Update old chat entry count
                        oldChatEntryCount = newChatEntryCount;
                    }
                } catch (err) {
                    if (err.name === 'TimeoutError') {
                        // Suppress logging for timeouts, as they occur when there's no live stream or chat
                        console.log('No live chat messages found (timeout).');
                    } else {
                        console.error('Error fetching chat:', err);
                    }
                    await new Promise(r => setTimeout(r, 10000)); // Wait 10 seconds before retrying
                }
            }

            // Throttle message collection to avoid overwhelming the page
            await new Promise(r => setTimeout(r, 500)); // Adjusted to half a second for quicker checks
        } catch (err) {
            console.error('Error in main loop:', err);
            await new Promise(r => setTimeout(r, 5000)); // Wait before retrying on error
        }
    }

    await browser.close();
})();
