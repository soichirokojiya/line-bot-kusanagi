const {
  validateSignature,
  replyMessage,
  pushMessage,
  getBotProfile,
  getUserProfile,
  getGroupMemberProfile,
} = require("../lib/line");
const { findVendors } = require("../lib/sheets");
const { getAllKnowledge } = require("../lib/knowledge");
const { askBookings } = require("../lib/bookings");
const { askClaude } = require("../lib/claude");
const { submitDiary } = require("../lib/diary");
const { requestReceipt } = require("../lib/receipt");

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
async function handleQuery(query, { lineUserId, groupId } = {}) {
  // 予約・空き・料金は Beds24 を直接見る (スタッフのみ)。無関係な質問は handled:false で下に流れる
  const booking = await askBookings({ lineUserId, groupId, question: query });
  if (booking.handled) return { type: "knowledge", answer: booking.answer };

  // まずベンダー検索 (id_pass)。シート鍵が失われていて止まっているので、失敗してもナレッジ回答に進む
  const vendors = await findVendors(query).catch((err) => {
    console.warn("findVendors skipped:", err.message);
    return [];
  });
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

// "日報 ..." / "報告 ..." / 全角スペース混じりにも対応
const DIARY_RE = /^(?:日報|報告)[\s　]+([\s\S]+)$/;
// グループ用: "kusanagi 日報 ..." / "kusanagi 報告 ..."
const DIARY_GROUP_RE = /^kusanagi[\s　]+(?:日報|報告)[\s　]+([\s\S]+)$/i;

async function handleDiary({ lineUserId, displayName, rawInput, replyToken }) {
  if (!rawInput) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text:
          "用件を言え。\n例: 日報 今日 MINAWA で清掃と朝食。8時から13時。IH壊れた。\n\n書式自由。施設(MINAWA/THERM)、作業内容、時間、困りごとを含めろ。",
      },
    ]);
    return;
  }
  try {
    const result = await submitDiary({ lineUserId, displayName, rawInput });
    const summary = result.summary || "記録のみ";
    const linkHint = result.bound_to_staff
      ? ""
      : "\n(まだスタッフに紐付いていない。管理画面で line_user_id を hr_staff に登録しろ。)";
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `${summary}\n\n記録した。誤りがあれば管理画面で直せ。${linkHint}`,
      },
    ]);
  } catch (err) {
    console.error("Diary submit error:", err.message, err.stack);
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `日報の記録に失敗した。……よくあることだ。\n${err.message}`,
      },
    ]);
  }
}

// "領収書 ..." (DM) / "kusanagi 領収書 ..." (グループ)。改行区切りの項目書きでもよい
// 「領収書」が文中のどこかにあれば領収書の依頼とみなす (「加来さんに領収書の発行をお願いいたします」も拾う)。
// 先頭の「kusanagi」「領収書」を外した残りを依頼文として villa-system に渡す。空なら書式を案内する
function receiptRequest(text) {
  const body = text.replace(/^kusanagi[\s　]*/i, "");
  if (!/領収書/.test(body)) return null;
  return body.replace(/^領収書[\s　]*/, "").trim();
}

const RECEIPT_USAGE =
  "書式はこうだ。\n\nkusanagi 領収書\n日付：10月6日\n金額：44,000円\n宛名：JOYコミュニケーションズ株式会社\n但書：4名様 宿泊代\n施設：VILLA MINAWA\n支払方法：現金\n\n金額と宛名は必須。施設は但書の後ろに「宿泊代(VILLA MINAWA)」の形で入る。日付を省けば今日、但書を省けば「ご宿泊代」になる。";

async function handleReceipt({ lineUserId, groupId, displayName, rawInput, replyToken }) {
  if (!rawInput) {
    await replyMessage(replyToken, [{ type: "text", text: RECEIPT_USAGE }]);
    return;
  }
  try {
    const result = await requestReceipt({ lineUserId, groupId, displayName, rawInput });
    // 金額などが足りないときは発行せず聞き返す (Square の請求書から下書きを出すこともある)
    if (result.issued === false) {
      await replyMessage(replyToken, [{ type: "text", text: result.message }]);
      return;
    }
    const driveNote = result.drive_saved === false
      ? `\n\n※ドライブへの保管に失敗した。PDFは控えておけ。(${result.drive_error})`
      : "";
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `${result.summary}\n\n発行した。PDFはここだ (7日間有効):\n${result.url}\n\n誤りがあれば書き直して送れ。番号は新しく振る。${driveNote}`,
      },
    ]);
  } catch (err) {
    console.error("Receipt error:", err.message, err.stack);
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `領収書は発行していない。\n${err.message}\n\n${RECEIPT_USAGE}`,
      },
    ]);
  }
}

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return;

  const { source, message, replyToken } = event;

  // 1対1チャットの場合: そのまま検索
  if (source.type === "user") {
    const text = message.text.trim();

    // 日報モード
    const diaryMatch = text.match(DIARY_RE);
    if (diaryMatch || /^(?:日報|報告)$/.test(text)) {
      const raw = diaryMatch?.[1] ?? "";
      const profile = await getUserProfile(source.userId).catch(() => ({}));
      await handleDiary({
        lineUserId: source.userId,
        displayName: profile.displayName || "",
        rawInput: raw,
        replyToken,
      });
      return;
    }

    // 領収書モード
    const receiptRaw = receiptRequest(text);
    if (receiptRaw !== null) {
      const profile = await getUserProfile(source.userId).catch(() => ({}));
      await handleReceipt({
        lineUserId: source.userId,
        displayName: profile.displayName || "",
        rawInput: receiptRaw,
        replyToken,
      });
      return;
    }

    const query = text;

    try {
      const result = await handleQuery(query, { lineUserId: source.userId });

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

    // 日報モード (グループ): "kusanagi 日報 ..."
    const diaryGroup = text.match(DIARY_GROUP_RE);
    if (diaryGroup || /^kusanagi[\s　]+(?:日報|報告)$/i.test(text)) {
      const raw = diaryGroup?.[1] ?? "";
      const profile = await getGroupMemberProfile(
        source.groupId,
        source.userId
      ).catch(() => ({}));
      await handleDiary({
        lineUserId: source.userId,
        displayName: profile.displayName || "",
        rawInput: raw,
        replyToken,
      });
      return;
    }

    // 領収書モード (グループ): "kusanagi 領収書 ..."
    const receiptRaw = receiptRequest(text);
    if (receiptRaw !== null) {
      const profile = await getGroupMemberProfile(
        source.groupId,
        source.userId
      ).catch(() => ({}));
      await handleReceipt({
        lineUserId: source.userId,
        groupId: source.groupId,
        displayName: profile.displayName || "",
        rawInput: receiptRaw,
        replyToken,
      });
      return;
    }

    const query = text.replace(trigger, "").trim();

    // グループID取得コマンド
    if (query === "groupid" || query === "グループID") {
      await replyMessage(replyToken, [
        { type: "text", text: `このグループのID:\n${source.groupId}` },
      ]);
      return;
    }

    if (!query) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "用件を言え。\n例: kusanagi アマゾン\n例: kusanagi 有給の申請方法は？\n例: kusanagi 日報 今日 MINAWA で清掃 8時〜13時",
        },
      ]);
      return;
    }

    try {
      const result = await handleQuery(query, { lineUserId: source.userId, groupId: source.groupId });

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
