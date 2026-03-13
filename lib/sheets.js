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
    range: "id_pass!A:E",
  });

  const rows = res.data.values;
  console.log("Sheet rows:", rows ? rows.length : "null", "First row:", rows ? rows[0] : "N/A");
  if (!rows || rows.length === 0) return [];

  // 最初の数行をデバッグ出力
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    console.log(`Row ${i}:`, JSON.stringify(rows[i]));
  }

  const normalize = (s) => (s || "").normalize("NFKC").toLowerCase().trim();
  const keywords = query.split(/\s+/).map(normalize).filter(Boolean);
  const results = [];

  console.log("findVendors query:", JSON.stringify(query), "keywords:", JSON.stringify(keywords));

  for (let i = 1; i < rows.length; i++) {
    const [vendor, facility, id, pass, url] = rows[i];
    if (!vendor) continue;

    // 全キーワードがベンダー名+施設名のどこかに含まれるか
    const text = normalize(`${vendor} ${facility || ""}`);
    const match = keywords.every((kw) => text.includes(kw));

    if (i <= 3) {
      console.log(`Check row ${i}: text="${text}" match=${match}`);
    }

    if (match) {
      results.push({ vendor, facility: facility || "", id, pass, url: url || "" });
    }
  }

  console.log("findVendors results:", results.length);

  return results;
}

async function getAllKnowledge() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "knowledge!A:B",
  });

  const rows = res.data.values;
  if (!rows || rows.length <= 1) return [];

  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const [category, content] = rows[i];
    if (!category && !content) continue;
    results.push({ category: category || "", content: content || "" });
  }

  return results;
}

module.exports = { findVendors, getAllKnowledge };
