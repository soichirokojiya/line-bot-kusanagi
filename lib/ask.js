// villa-system の /api/kusanagi/ask (道具を選ぶエージェント) と /api/kusanagi/invoice-cancel (請求取消の実行) を呼ぶ。
// Bearer KUSANAGI_API_KEY で認証 (日報・領収書と同じ鍵・同じ接続先)。

async function post(path, body) {
  const base = process.env.VILLA_SYSTEM_BASE_URL;
  const key = process.env.KUSANAGI_API_KEY;
  if (!base) throw new Error("VILLA_SYSTEM_BASE_URL が未設定だ");
  if (!key) throw new Error("KUSANAGI_API_KEY が未設定だ");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `villa-system 連携失敗 (${res.status})`);
  return data;
}

async function askAgent({ lineUserId, groupId, question }) {
  const data = await post("/api/kusanagi/ask", { line_user_id: lineUserId, group_id: groupId || "", question });
  return data.answer;
}

// 確認の一言「請求取消 #000092」(請求書取消/請求の取り消し 等の揺れも可)。番号必須。モデルを通さず直接実行する
const INVOICE_CANCEL_RE = /^(?:kusanagi[\s　]*)?請求書?の?取り?消し?[\s　]*[#＃]?[\s　]*([0-9０-９]{1,6})[\s　]*$/i;

function invoiceCancelNumber(text) {
  const m = text.trim().match(INVOICE_CANCEL_RE);
  return m ? m[1].normalize("NFKC") : null;
}

async function cancelInvoice({ lineUserId, groupId, displayName, invoiceNumber }) {
  const data = await post("/api/kusanagi/invoice-cancel", {
    line_user_id: lineUserId,
    group_id: groupId || "",
    display_name: displayName || "",
    invoice_number: invoiceNumber,
  });
  return data.answer;
}

// グループで「kusanagi 返信アラート先」→ そのグループをお客様メッセージ未返信アラートの送り先にする
const ALERT_TARGET_RE = /^kusanagi[\s　]*返信アラート先[\s　]*$/i;

async function setAlertTarget({ lineUserId, groupId, displayName }) {
  const data = await post("/api/kusanagi/alert-target", {
    line_user_id: lineUserId,
    group_id: groupId || "",
    display_name: displayName || "",
  });
  return data.answer;
}

module.exports = { askAgent, invoiceCancelNumber, cancelInvoice, ALERT_TARGET_RE, setAlertTarget };
