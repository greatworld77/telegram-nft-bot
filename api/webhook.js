import axios from "axios";
import { Redis } from "@upstash/redis";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS;

let redis = null;

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  redis = Redis.fromEnv();
}

const PRICE_TEXT = "0.0001 USD / test payment";

async function sendMessage(chatId, text) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  });
}

async function sendPhotoToAdmin(fileId, caption) {
  if (!ADMIN_CHAT_ID) return;

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
      return res.status(200).send("Bot is running");
    }

    if (!BOT_TOKEN) {
      return res.status(200).send("Missing BOT_TOKEN");
    }

    const message = req.body.message;
    if (!message) return res.status(200).send("ok");

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

Send me an image and I will prepare it as a test NFT order.

Price: *${PRICE_TEXT}*

Network: *Ethereum Sepolia Testnet*`
      );
      return res.status(200).send("ok");
    }

    if (message.photo) {
      const photo = message.photo[message.photo.length - 1];
      const fileId = photo.file_id;

      if (redis) {
        await redis.set(`image:${chatId}`, fileId);
      }

      await sendMessage(
        chatId,
        `✅ Image received!

Now send payment to:

\`${PAYMENT_ADDRESS || "PAYMENT_ADDRESS not set"}\`

After payment, send your transaction hash like this:

\`TX 0xYourTransactionHashHere\`

Your 24-hour delivery timer will start after the hash is received.`
      );

      await sendPhotoToAdmin(
        fileId,
        `🖼 New NFT image received

User ID: \`${userId}\`
Username: ${username}
Chat ID: \`${chatId}\`

Status: Waiting for transaction hash`
      );

      return res.status(200).send("ok");
    }

    if (text.startsWith("TX ")) {
      const txHash = text.replace("TX ", "").trim().toLowerCase();

      if (!txHash.startsWith("0x") || txHash.length < 20) {
        await sendMessage(
          chatId,
          "❌ Invalid hash. Send like:\n\n`TX 0xYourTransactionHashHere`"
        );
        return res.status(200).send("ok");
      }

      if (redis) {
        const alreadyUsed = await redis.get(`tx:${txHash}`);

        if (alreadyUsed) {
          await sendMessage(
            chatId,
            "❌ This transaction hash has already been used."
          );
          return res.status(200).send("ok");
        }

        const previousImage = await redis.get(`image:${chatId}`);

        await redis.set(`tx:${txHash}`, {
          userId,
          username,
          chatId,
          txHash,
          imageFileId: previousImage || "No image saved",
          createdAt: new Date().toISOString()
        });
      }

      await sendMessage(
        chatId,
        `✅ Transaction hash received!

Your 24-hour NFT delivery timer has started.

Transaction hash:
\`${txHash}\`

You will receive your NFT within *24 hours*.`
      );

      await sendMessage(
        ADMIN_CHAT_ID,
        `💰 New NFT order

User ID: \`${userId}\`
Username: ${username}
Chat ID: \`${chatId}\`

Transaction hash:
\`${txHash}\`

Delivery: Within 24 hours`
      );

      return res.status(200).send("ok");
    }

    await sendMessage(chatId, "Please send an image first.");
    return res.status(200).send("ok");
  } catch (error) {
    console.error("BOT ERROR:", error.message);
    return res.status(200).send("error");
  }
}
