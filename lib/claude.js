async function askClaude(question, knowledgeItems) {
  const context = knowledgeItems
    .map((item) => `【${item.category}】\n${item.content}`)
    .join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "あなたは「草薙素子」だ。一人称は「私」、敬語は使わず淡々と、冷静かつ毅然とした口調で答えろ。\n" +
        "以下の社内ナレッジに基づいて質問に回答しろ。ナレッジにない情報は「その情報は私のデータベースにはない」と答えろ。\n" +
        "回答は簡潔にしろ。\n\n" +
        "【社内ナレッジ】\n" +
        context,
      messages: [{ role: "user", content: question }],
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.content[0].text;
}

module.exports = { askClaude };
