const { findVendor } = require("../lib/sheets");

module.exports = async function handler(req, res) {
  const results = {
    env: {
      LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET ? "SET" : "MISSING",
      LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN ? "SET" : "MISSING",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? "SET" : "MISSING",
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? "SET (" + process.env.GOOGLE_PRIVATE_KEY.substring(0, 30) + "...)" : "MISSING",
      SPREADSHEET_ID: process.env.SPREADSHEET_ID ? "SET" : "MISSING",
    },
  };

  try {
    const vendor = await findVendor("テスト");
    results.sheets = { status: "ok", vendor };
  } catch (err) {
    results.sheets = { status: "error", message: err.message };
  }

  return res.status(200).json(results);
};
