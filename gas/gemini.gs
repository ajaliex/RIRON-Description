function callGeminiAPI(prompt) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('APIキーが設定されていません。GASのスクリプトプロパティをご確認ください。');
  }
  const url = `${CONFIG.GEMINI_ENDPOINT}${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());

    if (responseCode !== 200) {
      console.error(`Gemini API Error (${responseCode}):`, result);
      throw new Error(result.error?.message || 'Gemini API 호출に失敗しました。');
    }

    if (result.candidates && result.candidates.length > 0) {
      return result.candidates[0].content.parts[0].text;
    } else {
      throw new Error('予期しないAPIレスポンス形式です。');
    }
  } catch (error) {
    console.error('Gemini API request failed:', error);
    throw error;
  }
}

function generateQuestion(topicData) {
  const prompt = `あなたは税理士試験（法人税法）の出題者です。
以下の論点の内容に基づいて、税理士試験の理論問題として出題してください。

【出題ルール】
- 「〜について説明しなさい」「〜の規定について述べなさい」のような、条文の内容を問う形式で出題すること
- 論点の中から1つのセクションまたは関連する複数セクションを対象に出題すること
- ☆マーク付きのセクション（重要項目）を優先的に出題すること
- 毎回異なる切り口で出題すること（同じ論点でも違う角度から問う）
- 出題文のみを返却し、解答例は含めないこと
- 実際の税理士試験の出題形式に近い文体で出題すること

【論点データ】
${JSON.stringify(topicData)}`;

  return callGeminiAPI(prompt);
}

function evaluateAnswer(topicData, question, answer) {
  const prompt = `あなたは税理士試験（法人税法）の採点者です。
以下の問題に対するユーザーの回答を評価し、フィードバックを提供してください。

【評価基準】
- 一字一句の正確性は重視しない
- 記載すべき内容に過不足がないかを主な基準とする
- 重要なキーワードや要件が含まれているかを確認する
- 条文の趣旨や規定の本質を正しく理解しているかを評価する

【フィードバック形式】
必ず以下の4項目の見出しどおりに出力してください。**アスタリスクやマークダウン等の装飾記号は一切含めないでください。プレーンテキストのみを使用してください。**

総合評価: A（十分）/ B（概ね良好・一部不足）/ C（重要な不足あり）/ D（大幅な不足・誤り）
良い点: 正しく記載できている部分を具体的に指摘
不足・改善点: 記載が不足している内容、誤っている内容を具体的に指摘
模範解答の要点: この問題で記載すべきだった主要ポイントを箇条書きで提示

【問題文】
${question}

【論点の正確な内容（採点基準）】
${JSON.stringify(topicData)}

【ユーザーの回答】
${answer}`;

  return callGeminiAPI(prompt);
}
