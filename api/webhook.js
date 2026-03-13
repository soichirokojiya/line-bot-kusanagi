const { validateSignature, replyMessage, pushMessage, getBotProfile } = require("../lib/line");
const { findVendor } = require("../lib/sheets");

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
  // メンション部分を除去してクエリを取得
  let query = text;
  if (mentionees && mentionees.length > 0) {
    // メンションを除去
    const sorted = [...mentionees].sort((a, b) => b.index - a.index);
    for (const m of sorted) {
      query = query.slice(0, m.index) + query.slice(m.index + m.length);
    }
  }
  // 余分な空白・改行を除去
  return query.replace(/\s+/g, " ").trim();
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", bot: "M.Kusanagi" });
  }

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  // 署名検証
  const signature = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);

  if (!validateSignature(body, signature)) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  const events = req.body.events || [];

  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (err) {
      console.error("Event handling error:", err);
    }
  }

  return res.status(200).json({ status: "ok" });
};

async function handleEvent(event) {
  // テキストメッセージのみ処理
  if (event.type !== "message" || event.message.type !== "text") return;

  const { source, message, replyToken } = event;
  const myUserId = await getBotUserId();

  // グループの場合: メンションされたときだけ反応
  if (source.type === "group") {
    const mention = message.mention;
    if (!mention || !mention.mentionees) return;

    const isMentioned = mention.mentionees.some((m) => m.userId === myUserId);
    if (!isMentioned) return;

    // クエリ抽出
    const query = extractQuery(message.text, message.mention.mentionees);

    if (!query) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "ベンダー名を指定してください。\n例: @M.Kusanagi アマゾン",
        },
      ]);
      return;
    }

    // スプレッドシート検索
    const vendor = await findVendor(query);

    if (!vendor) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: `「${query}」に該当するベンダーが見つかりませんでした。`,
        },
      ]);
      return;
    }

    // グループにはIDだけ返信
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `【${vendor.name}】\nID: ${vendor.id}\n\n※パスワードは個人チャットに送信しました。`,
      },
    ]);

    // パスワードは個人チャットにプッシュ
    if (source.userId) {
      await pushMessage(source.userId, [
        {
          type: "text",
          text: `【${vendor.name}】のパスワード\nPASS: ${vendor.pass}`,
        },
      ]);
    } else {
      // ユーザーIDが取得できない場合（友だち未追加など）
      console.warn("Cannot push password: userId not available");
    }
  }

  // 1対1チャットの場合: そのまま応答
  if (source.type === "user") {
    const query = message.text.trim();

    const vendor = await findVendor(query);

    if (!vendor) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: `「${query}」に該当するベンダーが見つかりませんでした。\nスプレッドシートに登録されているベンダー名で検索してください。`,
        },
      ]);
      return;
    }

    await replyMessage(replyToken, [
      {
        type: "text",
        text: `【${vendor.name}】\nID: ${vendor.id}\nPASS: ${vendor.pass}`,
      },
    ]);
  }
}
