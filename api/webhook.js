const { validateSignature, replyMessage, pushMessage, getBotProfile } = require("../lib/line");
const { findVendors } = require("../lib/sheets");

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// BotのユーザーIDをキャッシュ
let botUserId = null;

async function getBotUserId() {
  if (botUserId) return botUserId;
  const profile = await getBotProfile();
  botUserId = profile.userId;
  return botUserId;
}

// メッセージからメンション後のテキストを抽出
function extractQuery(text, mentionees) {
  let query = text;
  if (mentionees && mentionees.length > 0) {
    const sorted = [...mentionees].sort((a, b) => b.index - a.index);
    for (const m of sorted) {
      query = query.slice(0, m.index) + query.slice(m.index + m.length);
    }
  }
  return query.replace(/\s+/g, " ").trim();
}

// 複数件のID一覧テキストを生成
function formatIdList(vendors) {
  return vendors
    .map((v) => {
      const label = v.facility ? `${v.vendor}（${v.facility}）` : v.vendor;
      let text = `${label}\n  ID: ${v.id}`;
      if (v.url) text += `\n  URL: ${v.url}`;
      return text;
    })
    .join("\n\n");
}

// 複数件のPASS一覧テキストを生成
function formatPassList(vendors) {
  return vendors
    .map((v) => {
      const label = v.facility ? `${v.vendor}（${v.facility}）` : v.vendor;
      return `${label}\n  PASS: ${v.pass}`;
    })
    .join("\n\n");
}

async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", bot: "M.Kusanagi" });
  }

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["x-line-signature"];

    if (!validateSignature(rawBody, signature)) {
      return res.status(403).json({ error: "Invalid signature" });
    }

    const body = JSON.parse(rawBody);
    const events = body.events || [];

    if (events.length === 0) {
      return res.status(200).json({ status: "ok" });
    }

    for (const event of events) {
      try {
        await handleEvent(event);
      } catch (err) {
        console.error("Event handling error:", err.message, err.stack);
      }
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Webhook error:", err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return;

  const { source, message, replyToken } = event;

  // 1対1チャットの場合
  if (source.type === "user") {
    const query = message.text.trim();

    try {
      const vendors = await findVendors(query);

      if (vendors.length === 0) {
        await replyMessage(replyToken, [
          {
            type: "text",
            text: `「${query}」……該当するベンダーは見つからなかった。\n正確な名前で頼む。`,
          },
        ]);
        return;
      }

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `${formatIdList(vendors)}\n\n${formatPassList(vendors)}\n\n取り扱いには気をつけろ。`,
        },
      ]);
    } catch (err) {
      console.error("findVendor error:", err.message, err.stack);
      await replyMessage(replyToken, [
        {
          type: "text",
          text: `障害が発生した。……よくあることだ。\n${err.message}`,
        },
      ]);
    }
    return;
  }

  // グループの場合: 「草薙」で始まるメッセージに反応
  if (source.type === "group") {
    const text = message.text.trim();
    const trigger = /^kusanagi\s*/i;
    if (!trigger.test(text)) return;

    const query = text.replace(trigger, "").trim();

    if (!query) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "ベンダー名を言え。\n例: kusanagi アマゾン",
        },
      ]);
      return;
    }

    try {
      const vendors = await findVendors(query);

      if (vendors.length === 0) {
        await replyMessage(replyToken, [
          {
            type: "text",
            text: `「${query}」……該当なしだ。名前を確認しろ。`,
          },
        ]);
        return;
      }

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `${formatIdList(vendors)}\n\nパスワードは個別に送った。ここでは晒さない。`,
        },
      ]);

      if (source.userId) {
        await pushMessage(source.userId, [
          {
            type: "text",
            text: `${formatPassList(vendors)}\n\n漏らすなよ。`,
          },
        ]);
      }
    } catch (err) {
      console.error("Group handler error:", err.message, err.stack);
      await replyMessage(replyToken, [
        {
          type: "text",
          text: `障害が発生した。……よくあることだ。\n${err.message}`,
        },
      ]);
    }
  }
}

handler.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = handler;
