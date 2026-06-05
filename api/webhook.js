import axios from "axios";
import FormData from "form-data";
import { ethers } from "ethers";

const BOT_TOKEN = process.env.BOT_TOKEN;
const PINATA_JWT = process.env.PINATA_JWT;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PAYMENT_RECEIVER = process.env.PAYMENT_RECEIVER;

const PRICE_ETH = "0.0001";

const ABI = [
  "function mintTo(address to, string memory tokenURI) public returns (uint256)"
];

async function sendMessage(chatId, text) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  });
}

async function getTelegramFile(fileId) {
  const fileInfo = await axios.get(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
  );

  const filePath = fileInfo.data.result.file_path;

  const file = await axios.get(
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`,
    { responseType: "arraybuffer" }
  );

  return Buffer.from(file.data);
}

async function uploadImageToPinata(buffer) {
  const form = new FormData();
  form.append("file", buffer, "telegram-nft.jpg");

  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${PINATA_JWT}`
      }
    }
  );

  return res.data.IpfsHash;
}

async function uploadMetadataToPinata(metadata) {
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    metadata,
    {
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`
      }
    }
  );

  return res.data.IpfsHash;
}

async function verifyPayment(txHash) {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);

  const tx = await provider.getTransaction(txHash);
  if (!tx) return false;

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) return false;

  const correctReceiver =
    tx.to && tx.to.toLowerCase() === PAYMENT_RECEIVER.toLowerCase();

  const correctAmount = tx.value >= ethers.parseEther(PRICE_ETH);

  return correctReceiver && correctAmount;
}

async function mintNFT(walletAddress, tokenURI) {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  const tx = await contract.mintTo(walletAddress, tokenURI);
  await tx.wait();

  return tx.hash;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).send("Bot is running");
    }

    const message = req.body.message;
    if (!message) return res.status(200).send("ok");

    const chatId = message.chat.id;
    const text = message.text || "";

    if (text === "/start") {
      await sendMessage(
        chatId,
        `👋 Welcome to the NFT Minting Bot!

Send me an image and I will turn it into an NFT on the Sepolia testnet.

Price per NFT: *${PRICE_ETH} Sepolia ETH*

Payment address:
\`${PAYMENT_RECEIVER}\`

Please upload your image now.`
      );

      return res.status(200).send("ok");
    }

    if (message.photo) {
      await sendMessage(chatId, "✅ Image received. Uploading to IPFS...");

      const photo = message.photo[message.photo.length - 1];
      const imageBuffer = await getTelegramFile(photo.file_id);
      const imageCid = await uploadImageToPinata(imageBuffer);

      await sendMessage(
        chatId,
        `✅ Image uploaded successfully!

Your image CID:
\`${imageCid}\`

Now pay *${PRICE_ETH} Sepolia ETH* to:

\`${PAYMENT_RECEIVER}\`

After payment, send this format:

\`MINT ${imageCid} YOUR_TRANSACTION_HASH YOUR_WALLET_ADDRESS\`

Example:

\`MINT ${imageCid} 0x123abc 0xyourwalletaddress\``
      );

      return res.status(200).send("ok");
    }

    if (text.startsWith("MINT ")) {
      const parts = text.split(" ");

      if (parts.length !== 4) {
        await sendMessage(
          chatId,
          "❌ Wrong format.\n\nUse:\n`MINT IMAGE_CID TX_HASH WALLET_ADDRESS`"
        );

        return res.status(200).send("ok");
      }

      const imageCid = parts[1];
      const txHash = parts[2];
      const walletAddress = parts[3];

      if (!ethers.isAddress(walletAddress)) {
        await sendMessage(chatId, "❌ Invalid wallet address.");
        return res.status(200).send("ok");
      }

      await sendMessage(chatId, "🔎 Checking payment...");

      const paymentValid = await verifyPayment(txHash);

      if (!paymentValid) {
        await sendMessage(
          chatId,
          "❌ Payment not valid. Please check transaction hash, amount, and receiver address."
        );

        return res.status(200).send("ok");
      }

      await sendMessage(chatId, "✅ Payment confirmed. Minting NFT...");

      const metadata = {
        name: "Telegram Minted NFT",
        description: "NFT created from a Telegram uploaded image.",
        image: `ipfs://${imageCid}`
      };

      const metadataCid = await uploadMetadataToPinata(metadata);
      const tokenURI = `ipfs://${metadataCid}`;

      const mintTx = await mintNFT(walletAddress, tokenURI);

      await sendMessage(
        chatId,
        `🎉 NFT minted successfully!

Mint transaction:
\`${mintTx}\`

Token URI:
\`${tokenURI}\``
      );

      return res.status(200).send("ok");
    }

    await sendMessage(chatId, "Please send an image to mint as NFT.");
    return res.status(200).send("ok");
  } catch (error) {
    console.error(error);
    return res.status(200).send("error");
  }
}
