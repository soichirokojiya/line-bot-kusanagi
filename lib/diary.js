// villa-system の /api/daily-reports/ingest に日報を投げる薄いクライアント。
// Bearer KUSANAGI_API_KEY で認証。
//
// 必要 env:
//   VILLA_SYSTEM_BASE_URL  (例: https://villa-system.vercel.app)
//   KUSANAGI_API_KEY       (villa-system 側と一致)

async function submitDiary({ lineUserId, displayName, rawInput }) {
  const base = process.env.VILLA_SYSTEM_BASE_URL;
  const key = process.env.KUSANAGI_API_KEY;
  if (!base) throw new Error("VILLA_SYSTEM_BASE_URL が未設定だ");
  if (!key) throw new Error("KUSANAGI_API_KEY が未設定だ");

  const res = await fetch(`${base}/api/daily-reports/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      line_user_id: lineUserId,
      display_name: displayName || "",
      raw_input: rawInput,
      source: "line",
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `villa-system 連携失敗 (${res.status})`);
  }
  return data; // { data: {...}, summary: "...", bound_to_staff: bool }
}

module.exports = { submitDiary };
