function doGet(e) {
  const action = e.parameter.action;
  let responseData = {};

  try {
    if (action === 'topics') {
      responseData = getTopicsList();
    } else {
      responseData = { error: 'Unknown action or missing parameters' };
    }
  } catch (error) {
    responseData = { error: error.message };
  }

  return respondJson(responseData);
}

function doPost(e) {
  const action = e.parameter.action;
  let responseData = {};

  try {
    if (action === 'question') {
      const topicId = e.parameter.topicId;
      if (!topicId) throw new Error('topicId parameter is missing');

      const topicData = getTopicData(topicId);
      if (!topicData) throw new Error(`Topic not found: ${topicId}`);

      const questionData = generateQuestion(topicData);
      responseData = { question: questionData };
      
    } else if (action === 'evaluate') {
      const topicId = e.parameter.topicId;
      const question = e.parameter.question;
      const answer = e.parameter.answer;

      if (!topicId || !question || !answer) {
        throw new Error('Missing parameters');
      }

      const topicData = getTopicData(topicId);
      if (!topicData) throw new Error(`Topic not found: ${topicId}`);

      const feedbackData = evaluateAnswer(topicData, question, answer);
      responseData = { feedback: feedbackData };
      
    } else {
      responseData = { error: 'Unknown action' };
    }
  } catch (error) {
    responseData = { error: error.message };
  }

  return respondJson(responseData);
}

// 共通のJSONレスポンス作成処理
// doPost / doGetのレスポンスにはContentServiceを使用する。デフォルトでCORS対応される。
function respondJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
