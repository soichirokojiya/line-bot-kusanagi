// 予約・空き・料金の照会を villa-system の /api/kusanagi/bookings (Beds24 を直接読む) に投げる。
// 予約と無関係な質問なら { handled: false } が返り、呼び出し側はナレッジ回答に回す。

// 予約照会らしい言葉が無い質問は villa-system に投げない (余計な往復を避ける)
const BOOKING_HINT = /(予約|空き|空室|空いて|埋ま|満室|稼働|料金|値段|価格|金額|いくら|高い|安い|最高|最安|売上|何組|泊まれ|名だと|プラン|beds|bed24|ベッズ|設定)/i;

async function askBookings({ lineUserId, groupId, question }) {
  if (!BOOKING_HINT.test(question)) return { handled: false };
  const base = process.env.VILLA_SYSTEM_BASE_URL;
  const key = process.env.KUSANAGI_API_KEY;
  if (!base || !key) return { handled: false };

  const res = await fetch(`${base}/api/kusanagi/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ line_user_id: lineUserId, group_id: groupId || "", question }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `予約照会失敗 (${res.status})`);
  return data; // { handled, answer }
}

module.exports = { askBookings };
