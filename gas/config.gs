const CONFIG = {
  GEMINI_MODEL: 'gemini-1.5-flash',
  GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/'
};

// スクリプトプロパティからAPIキーを取得する関数
function getApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    console.error('Gemini API key is not set in Script Properties.');
  }
  return key;
}
