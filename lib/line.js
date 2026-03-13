const crypto = require("crypto");

const LINE_API = "https://api.line.me/v2/bot";

function validateSignature(body, signature) {
  const hash = crypto
    .createHmac("SHA256", process.env.LINE_CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return hash === signature;
}

async function replyMessage(replyToken, messages) {
  await fetch(`${LINE_API}/message/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

async function pushMessage(userId, messages) {
  await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: userId, messages }),
  });
}

async function getBotProfile() {
  const res = await fetch(`${LINE_API}/info`, {
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  });
  return res.json();
}

module.exports = { validateSignature, replyMessage, pushMessage, getBotProfile };
