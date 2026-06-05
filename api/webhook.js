import axios from "axios";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS;

const PRICE_TEXT = "0.0001 USD / test payment";

async function sendMessage(chatId, text) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  });
}

async function sendPhotoToAdmin(fileId, caption) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    chat_id: ADMIN_CHAT_ID,
    photo: fileId,
    caption,
    parse_mode: "Markdown"
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).send("Telegram NFT test bot is running.");
    }

    const message = req.body.message;

    if (!message) {
      return res.status(200).send("ok");
    }

    const chatId = message.chat.id;
    const userId = message.from?.id || "Unknown";
    const username = message.from?.username
      ? `@${message.from.username}`
      : "No username";
    const firstName = message.from?.first_name || "User";
    const text = message.text || "";

    if (text === "/start") {
      await sendMessage(
        chatId,
        `👋 Welcome, ${firstName}!

I can help you create a test NFT from your image.

Please send me the image you want to turn into an NFT.

Price for 1 NFT: *${PRICE_TEXT}*

Network: *Ethereum Sepolia Testnet*`
      );

      return res.status(200).send("ok");
    }

    if (message.photo) {
      const photo = message.photo[message.photo.length - 1];
      const fileId = photo.file_id;

      await sendMessage(
        chatId,
        `✅ Image received successfully!

Now please make the payment.

Amount: *${PRICE_TEXT}*

Payment wallet:
\`${PAYMENT_ADDRESS}\`

After payment, send your transaction hash using this format:

\`TX 0xYourTransactionHashHere\`

After receiving your transaction hash, your NFT delivery timer of *24 hours* will start.`
      );

      await sendPhotoToAdmin(
        fileId,
        `🖼 New NFT image received

User ID: \`${userId}\`
Username: ${username}
Telegram Chat ID: \`${chatId}\`

Status: Waiting for transaction hash`
      );

      return res.status(200).send("ok");
    }

    if (text.startsWith("TX ")) {
      const txHash = text.replace("TX ", "").trim();

      if (!txHash.startsWith("0x") || txHash.length < 20) {
        await sendMessage(
          chatId,
          "❌ Invalid transaction hash format. Please send it like:\n\n`TX 0xYourTransactionHashHere`"
        );

        return res.status(200).send("ok");
      }

      await sendMessage(
        chatId,
        `✅ Transaction hash received!

Your 24-hour NFT delivery timer has started.

Transaction hash:
\`${txHash}\`

Network: *Ethereum Sepolia Testnet*

You will receive your NFT within *24 hours*.`
      );

      await sendMessage(
        ADMIN_CHAT_ID,
        `💰 New NFT order payment hash received

User ID: \`${userId}\`
Username: ${username}
Telegram Chat ID: \`${chatId}\`

Transaction hash:
\`${txHash}\`

Delivery time: Within 24 hours`
      );

      return res.status(200).send("ok");
    }

    await sendMessage(
      chatId,
      `Please send an image first.

If you already paid, send your transaction hash like this:

\`TX 0xYourTransactionHashHere\``
    );

    return res.status(200).send("ok");
  } catch (error) {
    console.error(error);
    return res.status(200).send("error");
  }
}
