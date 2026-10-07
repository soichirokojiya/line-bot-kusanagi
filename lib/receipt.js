// villa-system の /api/receipts/ingest に領収書の発行を依頼する薄いクライアント。
// Bearer KUSANAGI_API_KEY で認証 (日報と同じ鍵・同じ接続先)。

async function requestReceipt({ lineUserId, groupId, displayName, rawInput }) {
  const base = process.env.VILLA_SYSTEM_BASE_URL;
  const key = process.env.KUSANAGI_API_KEY;
  if (!base) throw new Error("VILLA_SYSTEM_BASE_URL が未設定だ");
  if (!key) throw new Error("KUSANAGI_API_KEY が未設定だ");

  const res = await fetch(`${base}/api/receipts/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      line_user_id: lineUserId,
      group_id: groupId || "",
      display_name: displayName || "",
      raw_input: rawInput,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `villa-system 連携失敗 (${res.status})`);
  }
  return data; // { receipt_no, summary, url }
}

module.exports = { requestReceipt };
