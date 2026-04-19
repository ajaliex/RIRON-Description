/**
 * 毎朝の天気・服装通知アプリ（GAS + Gemini API + Discord Webhook）
 * 
 * ==============================================================================
 * 【セットアップ手順】
 * 
 * 1. APIキーの取得
 *    ■ OpenWeatherMap
 *      1) https://openweathermap.org/ にアクセスして無料アカウントを作成
 *      2) ログイン後、右上メニューの「My API keys」からAPIキーを取得
 * 
 *    ■ Gemini API
 *      1) https://aistudio.google.com/ にアクセス（Googleアカウントが必要）
 *      2) 左側のメニューから「Get API key」を選択し、新しいキーを作成してコピー
 * 
 * 2. Discord Webhookの作成
 *    1) 通知を送りたいDiscordのサーバー設定を開く
 *    2) 「連携サービス」→「ウェブフック」→「新しいウェブフック」の順にクリック
 *    3) 名前と投稿先のチャンネルを設定し、「ウェブフックURLをコピー」をクリック
 * 
 * 3. スクリプトプロパティの登録
 *    1) GASのエディタ左側メニューの「プロジェクトの設定（歯車アイコン）」を開く
 *    2) ページ下部の「スクリプト プロパティ」から「スクリプト プロパティを追加」をクリック
 *    3) 以下の3つのプロパティを設定して保存する
 *       - プロパティ: OPENWEATHER_API_KEY      値: (取得したOpenWeatherのAPIキー)
 *       - プロパティ: GEMINI_API_KEY           値: (取得したGeminiのAPIキー)
 *       - プロパティ: DISCORD_WEBHOOK_URL      値: (コピーしたDiscordのWebhook URL)
 * 
 * 4. トリガーの設定 (自動実行の設定)
 *    1) GASエディタ左側メニューの「トリガー（時計アイコン）」を開く
 *    2) 右下の「トリガーを追加」をクリック
 *    3) 以下のように設定して保存する
 *       - 実行する関数: main
 *       - 実行するデプロイ: Head
 *       - イベントのソース: 時間主導型
 *       - 時間ベースのトリガーのタイプ: 日ベースのタイマー
 *       - 時刻を選択: 午前4時～5時
 *       ※ 初回設定時はGoogleアカウントの権限承認アクションを求められる場合があります
 * ==============================================================================
 */

// スクリプトプロパティのキー名
const PROP_OPENWEATHER_API_KEY = 'OPENWEATHER_API_KEY';
const PROP_GEMINI_API_KEY = 'GEMINI_API_KEY';
const PROP_DISCORD_WEBHOOK_URL = 'DISCORD_WEBHOOK_URL';

/**
 * メイン処理（この関数を毎朝実行するようトリガー設定します）
 */
function main() {
  try {
    // 1. 天気情報の取得
    const weatherData = getWeatherData();
    
    // 2. Gemini APIでアドバイス生成
    const advice = generateAdvice(weatherData);
    
    // 3. Discordへ通知
    sendToDiscord(weatherData, advice);
    
  } catch (error) {
    console.error(error);
    sendErrorToDiscord(error.message);
  }
}

/**
 * OpenWeatherMapから天気情報を取得する
 * @returns {Object} 天気情報オブジェクト
 */
function getWeatherData() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty(PROP_OPENWEATHER_API_KEY);
  if (!apiKey) throw new Error(`${PROP_OPENWEATHER_API_KEY} が設定されていません。`);

  // 船橋市の天気を取得 (5 day / 3 hour forecast)
  const city = 'Funabashi,JP';
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${apiKey}&units=metric&lang=ja`;
  
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error(`天気APIの呼び出しに失敗しました: ${response.getContentText()}`);
  }
  
  const data = JSON.parse(response.getContentText());
  const now = new Date();
  
  // 今日の日付文字列 (YYYY-MM-DD) を取得。GASはスクリプトのタイムゾーン(通常はJST)に依存
  const todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  // 今日のデータのみを抽出
  const todaysForecasts = data.list.filter(item => {
    // item.dt は UTC epoch seconds のため、JSTに変換して今日の日付か判定
    const dt = new Date(item.dt * 1000);
    const dateStr = Utilities.formatDate(dt, Session.getScriptTimeZone(), "yyyy-MM-dd");
    return dateStr === todayStr;
  });

  if (todaysForecasts.length === 0) {
    // 深夜など今日のデータが取得できない場合は、直近のデータを使用
    todaysForecasts.push(data.list[0]);
  }

  // 必要な情報を集計
  let tempMax = -Infinity;
  let tempMin = Infinity;
  let popMax = 0; // 降水確率 (%)
  let windSpdMax = 0;
  
  // 代表的な天気概況（昼前後のデータを優先、なければ配列の最初）
  let weatherDesc = todaysForecasts[0].weather[0].description;
  const noonForecast = todaysForecasts.find(item => {
    const dt = new Date(item.dt * 1000);
    const hourStr = Utilities.formatDate(dt, Session.getScriptTimeZone(), "HH");
    return hourStr === "09" || hourStr === "12";
  });
  if (noonForecast) {
    weatherDesc = noonForecast.weather[0].description;
  }

  todaysForecasts.forEach(item => {
    if (item.main.temp_max > tempMax) tempMax = item.main.temp_max;
    if (item.main.temp_min < tempMin) tempMin = item.main.temp_min;
    if (item.pop * 100 > popMax) popMax = Math.round(item.pop * 100);
    if (item.wind.speed > windSpdMax) windSpdMax = item.wind.speed;
  });

  return {
    description: weatherDesc,
    tempMax: Math.round(tempMax),
    tempMin: Math.round(tempMin),
    pop: popMax,
    windSpeed: Math.round(windSpdMax * 10) / 10,
    date: Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy年MM月dd日")
  };
}

/**
 * Gemini APIを使ってアドバイスを生成する
 * @param {Object} weatherData - 天気情報
 * @returns {Object} JSONパースされたGeminiの回答
 */
function generateAdvice(weatherData) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty(PROP_GEMINI_API_KEY);
  if (!apiKey) throw new Error(`${PROP_GEMINI_API_KEY} が設定されていません。`);

  // Gemini 1.5 Flashモデルを使用
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `あなたはプロのスタイリスト兼お天気キャスターです。
以下の天気情報をもとに、成人男性に向けたアドバイスを生成してください。

【天気情報】
- 天気概況: ${weatherData.description}
- 最高気温: ${weatherData.tempMax}℃
- 最低気温: ${weatherData.tempMin}℃
- 降水確率: ${weatherData.pop}%
- 風速: ${weatherData.windSpeed}m/s

出力は以下のJSON形式に厳密に従ってください。マークダウン記法（\`\`\`json など）は絶対に含めないでください。
{
  "summary": "今日の天気まとめ（1〜2文）",
  "clothing": "推奨する服装（トップス・ボトムス・アウターなど具体的に）",
  "umbrella": "傘の必要性（不要 / 折り畳み傘でOK / しっかりした傘が必要、の3段階で判定し理由も添える）"
}
`;

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    // 強制的にJSONとしてレスポンスを出力させる（Gemini APIの機能）
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    throw new Error(`Gemini APIの呼び出しに失敗しました: ${response.getContentText()}`);
  }

  const result = JSON.parse(response.getContentText());
  let content = result.candidates[0].content.parts[0].text;
  
  // JSONをパース（念のため不要なマークダウンブロックを取り除く処理を補助として入れる）
  content = content.replace(/```json/g, "").replace(/```/g, "").trim();
  
  return JSON.parse(content);
}

/**
 * DiscordへWebhookで通知を送信する
 * @param {Object} weatherData - 天気情報
 * @param {Object} advice - Geminiからのアドバイス
 */
function sendToDiscord(weatherData, advice) {
  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty(PROP_DISCORD_WEBHOOK_URL);
  if (!webhookUrl) throw new Error(`${PROP_DISCORD_WEBHOOK_URL} が設定されていません。`);

  // 天気に応じたアイコンの選択
  let weatherIcon = "🌤";
  if (weatherData.description.includes("雨")) weatherIcon = "🌧";
  else if (weatherData.description.includes("雪")) weatherIcon = "❄️";
  else if (weatherData.description.includes("晴")) weatherIcon = "☀️";
  else if (weatherData.description.includes("曇")) weatherIcon = "☁️";

  const message = `☀️ 今日の天気レポート（船橋市）

📅 日付：${weatherData.date}
${weatherIcon} 天気：${weatherData.description}
🌡 気温：最高${weatherData.tempMax}℃ / 最低${weatherData.tempMin}℃
🌂 降水確率：${weatherData.pop}%
💨 風速：${weatherData.windSpeed}m/s

👔 服装アドバイス：
${advice.clothing}

☂️ 傘の判定：
${advice.umbrella}`;

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ content: message })
  };

  const res = UrlFetchApp.fetch(webhookUrl, options);
  if (res.getResponseCode() !== 204 && res.getResponseCode() !== 200) {
    throw new Error(`Discordへの通知に失敗しました: ${res.getContentText()}`);
  }
}

/**
 * エラー情報をDiscordに送信する
 * @param {string} errorMsg 
 */
function sendErrorToDiscord(errorMsg) {
  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty(PROP_DISCORD_WEBHOOK_URL);
  if (!webhookUrl) return; // WebhookURL自体がない場合は何もしない

  const message = `⚠️ **天気通知アプリ エラー**\n処理中にエラーが発生しました。\n\`\`\`\n${errorMsg}\n\`\`\``;

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ content: message })
  };

  UrlFetchApp.fetch(webhookUrl, { muteHttpExceptions: true, ...options });
}
