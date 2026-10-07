// Q&A 用ナレッジを villa-system の /api/kusanagi/knowledge から取得する。
// (LT_ID_PASS の id_pass 以外のタブ + 物件管理_VILLA MINAWA / THE THERM。秘匿行は villa-system 側で除外済み)
// Bearer KUSANAGI_API_KEY で認証 (日報・領収書と同じ鍵・同じ接続先)。

async function getAllKnowledge() {
  const base = process.env.VILLA_SYSTEM_BASE_URL;
  const key = process.env.KUSANAGI_API_KEY;
  if (!base) throw new Error("VILLA_SYSTEM_BASE_URL が未設定だ");
  if (!key) throw new Error("KUSANAGI_API_KEY が未設定だ");

  const res = await fetch(`${base}/api/kusanagi/knowledge`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `ナレッジ取得失敗 (${res.status})`);
  }
  return data.items || []; // [{ category, content }]
}

module.exports = { getAllKnowledge };
