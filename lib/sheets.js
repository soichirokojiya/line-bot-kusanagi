const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

async function findVendor(vendorName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "シート1!A:C",
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return null;

  // ヘッダー行をスキップして検索（部分一致）
  for (let i = 1; i < rows.length; i++) {
    const [name, id, pass] = rows[i];
    if (name && vendorName.includes(name)) {
      return { name, id, pass };
    }
    if (name && name.includes(vendorName)) {
      return { name, id, pass };
    }
  }

  return null;
}

module.exports = { findVendor };
