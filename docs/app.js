// GASのWebアプリURL（デプロイ後に書き換える）
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzCU--6_sl312V_Xv1il1hFHyF2go8utqDTNtIPp97WVYePargEdxAMckxvSmlhXqNOeg/exec';

document.addEventListener('DOMContentLoaded', () => {
    // 要素の取得
    const views = {
        topics: document.getElementById('topics-view'),
        question: document.getElementById('question-view')
    };
    
    // 論点選択画面の要素
    const topicsList = document.getElementById('topics-list');
    const loadingTopics = document.getElementById('loading-topics');
    const errorTopics = document.getElementById('error-topics');

    // 出題・回答画面の要素
    const currentTopicTitle = document.getElementById('current-topic-title');
    const loadingQuestion = document.getElementById('loading-question');
    const errorQuestion = document.getElementById('error-question');
    const questionContainer = document.getElementById('question-container');
    const questionText = document.getElementById('question-text');
    const answerInput = document.getElementById('answer-input');
    const submitAnswerBtn = document.getElementById('submit-answer');
    
    // フィードバック要素
    const loadingEvaluation = document.getElementById('loading-evaluation');
    const errorEvaluation = document.getElementById('error-evaluation');
    const feedbackContainer = document.getElementById('feedback-container');
    const feedbackGrade = document.getElementById('feedback-grade');
    const feedbackGood = document.getElementById('feedback-good');
    const feedbackBad = document.getElementById('feedback-bad');
    const feedbackModel = document.getElementById('feedback-model');

    // ボタン類
    const backBtn = document.getElementById('back-button');
    const nextQuestionBtn = document.getElementById('next-question');
    const backToTopicsBtn = document.getElementById('back-to-topics');

    let currentSession = {
        topicId: null,
        topicData: null,
        question: ''
    };

    // 初期化：論点一覧の取得
    fetchTopics();

    // イベントリスナー設定
    submitAnswerBtn.addEventListener('click', submitAnswer);
    backBtn.addEventListener('click', showTopicsView);
    backToTopicsBtn.addEventListener('click', showTopicsView);
    nextQuestionBtn.addEventListener('click', () => loadQuestion(currentSession.topicId, currentSession.topicData));

    function switchView(viewName) {
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[viewName].classList.add('active');
    }

    async function fetchTopics() {
        if (GAS_API_URL === 'YOUR_GAS_WEBAPP_URL_HERE') {
            showError(errorTopics, 'GASのWebアプリURLが設定されていません。app.jsのGAS_API_URLを書き換えてください。');
            loadingTopics.classList.add('hidden');
            return;
        }

        try {
            const response = await fetch(`${GAS_API_URL}?action=topics`);
            if (!response.ok) throw new Error('ネットワークエラーが発生しました');
            const data = await response.json();
            
            if (data.error) throw new Error(data.error);

            renderTopics(data);
            loadingTopics.classList.add('hidden');
            topicsList.classList.remove('hidden');
        } catch (err) {
            loadingTopics.classList.add('hidden');
            showError(errorTopics, `論点の取得に失敗しました: ${err.message}`);
        }
    }

    function renderTopics(topics) {
        topicsList.innerHTML = '';
        topics.forEach(topic => {
            const li = document.createElement('li');
            li.className = 'topic-item';
            
            // 重要マークの判定（タイトルに☆が含まれるか、内容に☆を含むセクションがあるかはバックエンドから渡されるとベターだが
            // UI上はタイトルに☆が含まれるかどうかを簡易表示）
            const titleHtml = escapeHtml(topic.title);
            
            li.innerHTML = `<span class="topic-title">${titleHtml}</span>`;
            
            li.addEventListener('click', () => {
                loadQuestion(topic.id, topic);
            });
            topicsList.appendChild(li);
        });
    }

    async function loadQuestion(topicId, topicData) {
        currentSession.topicId = topicId;
        currentSession.topicData = topicData;
        currentTopicTitle.textContent = topicData.title;
        
        switchView('question');
        
        // UI初期化
        questionContainer.classList.add('hidden');
        feedbackContainer.classList.add('hidden');
        errorQuestion.classList.add('hidden');
        errorEvaluation.classList.add('hidden');
        loadingQuestion.classList.remove('hidden');
        answerInput.value = '';
        submitAnswerBtn.disabled = false;

        try {
            const response = await fetch(GAS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `action=question&topicId=${encodeURIComponent(topicId)}`
            });
            
            if (!response.ok) throw new Error('ネットワークエラーが発生しました');
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            currentSession.question = data.question;
            questionText.textContent = data.question;
            loadingQuestion.classList.add('hidden');
            questionContainer.classList.remove('hidden');
            answerInput.focus();
            answerInput.disabled = false;
        } catch (err) {
            loadingQuestion.classList.add('hidden');
            showError(errorQuestion, `問題の取得に失敗しました: ${err.message}`);
        }
    }

    async function submitAnswer() {
        const answer = answerInput.value.trim();
        if (!answer) return;

        submitAnswerBtn.disabled = true;
        answerInput.disabled = true;
        loadingEvaluation.classList.remove('hidden');
        errorEvaluation.classList.add('hidden');

        try {
            const response = await fetch(GAS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `action=evaluate&topicId=${encodeURIComponent(currentSession.topicId)}&question=${encodeURIComponent(currentSession.question)}&answer=${encodeURIComponent(answer)}`
            });

            if (!response.ok) throw new Error('ネットワークエラーが発生しました');
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            renderFeedback(data.feedback);
            loadingEvaluation.classList.add('hidden');
            feedbackContainer.classList.remove('hidden');
        } catch (err) {
            loadingEvaluation.classList.add('hidden');
            submitAnswerBtn.disabled = false;
            answerInput.disabled = false;
            showError(errorEvaluation, `評価の取得に失敗しました: ${err.message}`);
        }
    }

    function renderFeedback(feedbackRaw) {
        // バックエンドから返ってくるテキスト形式のフィードバックをパースして表示する
        // 想定形式:
        // 1. 総合評価: A
        // 2. 良い点: ...
        // 3. 不足・改善点: ...
        // 4. 模範解答の要点: ...
        
        let grade = "判定不能";
        let good = "";
        let bad = "";
        let model = "";

        const lines = feedbackRaw.split('\n');
        let currentSection = "";

        lines.forEach(line => {
            if (line.match(/^1\.?\s*総合評価:/i) || line.match(/総合評価:/i)) {
                grade = line.replace(/^1\.?\s*総合評価:/i, '').replace(/総合評価:/i, '').trim();
                currentSection = "grade";
            } else if (line.match(/^2\.?\s*良い点:/i) || line.match(/良い点:/i)) {
                currentSection = "good";
                good += line.replace(/^2\.?\s*良い点:/i, '').replace(/良い点:/i, '').trim() + '\n';
            } else if (line.match(/^3\.?\s*不足・改善点:/i) || line.match(/不足・改善点:/i)) {
                currentSection = "bad";
                bad += line.replace(/^3\.?\s*不足・改善点:/i, '').replace(/不足・改善点:/i, '').trim() + '\n';
            } else if (line.match(/^4\.?\s*模範解答の要点:/i) || line.match(/模範解答の要点:/i)) {
                currentSection = "model";
                model += line.replace(/^4\.?\s*模範解答の要点:/i, '').replace(/模範解答の要点:/i, '').trim() + '\n';
            } else {
                if (currentSection === "good") good += line + '\n';
                else if (currentSection === "bad") bad += line + '\n';
                else if (currentSection === "model") model += line + '\n';
            }
        });

        feedbackGrade.textContent = grade || "見つかりませんでした";
        feedbackGood.textContent = good.trim() || "-";
        feedbackBad.textContent = bad.trim() || "-";
        feedbackModel.textContent = model.trim() || "-";
    }

    function showTopicsView() {
        switchView('topics');
    }

    function showError(element, message) {
        element.textContent = message;
        element.classList.remove('hidden');
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});
