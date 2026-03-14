const { validateSignature, replyMessage, pushMessage, getBotProfile } = require("../lib/line");
const { findVendors, getAllKnowledge } = require("../lib/sheets");
const { askClaude } = require("../lib/claude");

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

// 施設ごとにまとめた一覧テキストを生成（DM用: ID+PASS両方表示）
function formatVendorList(vendors) {
  return vendors
    .map((v) => {
      const label = v.facility ? `${v.vendor}（${v.facility}）` : v.vendor;
      let text = label;
      text += `\n  ID: ${v.id}`;
      text += `\n  PASS: ${v.pass}`;
      if (v.url) text += `\n  URL: ${v.url}`;
      return text;
    })
    .join("\n\n");
}

// 施設ごとにまとめた一覧テキストを生成（グループ用: IDのみ）
function formatVendorListPublic(vendors) {
  return vendors
    .map((v) => {
      const label = v.facility ? `${v.vendor}（${v.facility}）` : v.vendor;
      let text = label;
      text += `\n  ID: ${v.id}`;
      if (v.url) text += `\n  URL: ${v.url}`;
      return text;
    })
    .join("\n\n");
}

// PASS一覧（グループ用: DMで送る）
function formatPassList(vendors) {
  return vendors
    .map((v) => {
      const label = v.facility ? `${v.vendor}（${v.facility}）` : v.vendor;
      return `${label}\n  PASS: ${v.pass}`;
    })
    .join("\n\n");
}

// ベンダー検索 or RAG回答を処理
async function handleQuery(query) {
  // まずベンダー検索
  const vendors = await findVendors(query);
  if (vendors.length > 0) {
    return { type: "vendor", vendors };
  }

  // ベンダーにヒットしなければ全ナレッジをClaudeに渡して回答
  const knowledge = await getAllKnowledge();
  console.log("Knowledge entries:", knowledge.length);
  if (knowledge.length === 0) {
    console.log("No knowledge found in sheet");
  }
  const answer = await askClaude(query, knowledge);
  console.log("Claude answer:", answer);
  return { type: "knowledge", answer };
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

  // 1対1チャットの場合: そのまま検索
  if (source.type === "user") {
    const query = message.text.trim();

    try {
      const result = await handleQuery(query);

      if (result.type === "vendor") {
        await replyMessage(replyToken, [
          {
            type: "text",
            text: `${formatVendorList(result.vendors)}\n\n取り扱いには気をつけろ。`,
          },
        ]);
      } else if (result.type === "knowledge") {
        await replyMessage(replyToken, [
          {
            type: "text",
            text: result.answer,
          },
        ]);
      } else {
        await replyMessage(replyToken, [
          {
            type: "text",
            text: `「${query}」……該当する情報は見つからなかった。\n質問を変えてみろ。`,
          },
        ]);
      }
    } catch (err) {
      console.error("DM handler error:", err.message, err.stack);
      await replyMessage(replyToken, [
        {
          type: "text",
          text: `障害が発生した。……よくあることだ。\n${err.message}`,
        },
      ]);
    }
    return;
  }

  // グループの場合: 「kusanagi」で始まるメッセージに反応
  if (source.type === "group") {
    const text = message.text.trim();
    const trigger = /^kusanagi\s*/i;
    if (!trigger.test(text)) return;

    const query = text.replace(trigger, "").trim();

    if (!query) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "用件を言え。\n例: kusanagi アマゾン\n例: kusanagi 有給の申請方法は？",
        },
      ]);
      return;
    }

    try {
      const result = await handleQuery(query);

      if (result.type === "vendor") {
        await replyMessage(replyToken, [
          {
            type: "text",
            text: `${formatVendorList(result.vendors)}\n\n取り扱いには気をつけろ。`,
          },
        ]);
      } else if (result.type === "knowledge") {
        await replyMessage(replyToken, [
          {
            type: "text",
            text: result.answer,
          },
        ]);
      } else {
        await replyMessage(replyToken, [
          {
            type: "text",
            text: `「${query}」……該当する情報はない。質問を変えろ。`,
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
