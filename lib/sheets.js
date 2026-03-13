const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

async function findVendors(query) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "シート1!A:D",
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  const keywords = query.split(/\s+/);
  const results = [];

  for (let i = 1; i < rows.length; i++) {
    const [vendor, facility, id, pass] = rows[i];
    if (!vendor) continue;

    // 全キーワードがベンダー名+施設名のどこかに含まれるか
    const text = `${vendor} ${facility || ""}`;
    const match = keywords.every((kw) => text.includes(kw));

    if (match) {
      results.push({ vendor, facility: facility || "", id, pass });
    }
  }

  return results;
}

module.exports = { findVendors };
