function getTopicsList() {
  const topics = [];
  
  if (typeof TOPICS_FILES === 'undefined') return topics;

  for (const filename of TOPICS_FILES) {
    try {
      const parsedData = parseTopicFile(filename);
      if (parsedData) {
        topics.push({
          id: parsedData.id,
          title: parsedData.title,
          fullTitle: parsedData.fullTitle
        });
      }
    } catch (e) {
      console.warn(`Failed to parse ${filename}: ${e.message}`);
    }
  }
  
  return topics;
}

function getTopicData(topicId) {
  if (typeof TOPICS_FILES === 'undefined') return null;
  
  for (const filename of TOPICS_FILES) {
    try {
      const parsedData = parseTopicFile(filename);
      if (parsedData && parsedData.id === topicId) {
        return parsedData;
      }
    } catch (e) {
      // Ignore parse errors here during iteration
    }
  }
  return null;
}

function parseTopicFile(filename) {
  // GASのHtmlServiceは、プロジェクト内のHTMLファイル（拡張子抜き）にアクセスできます。
  // Claspを使用する場合、サブディレクトリ内のファイルは 'data/filename' 形式のファイル名になります。
  let htmlOutput;
  try {
    htmlOutput = HtmlService.createHtmlOutputFromFile(`data/${filename}`);
  } catch (e) {
    // 取得に失敗した場合
    return null;
  }
  
  const content = htmlOutput.getContent();
  
  // HTMLパース
  // GAS環境にはDOMParserがないため、正規表現を用いた簡易パースを行う
  const h2Match = content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const fullTitle = h2Match ? h2Match[1].replace(/<[^>]+>/g, '').trim() : filename;
  
  // idとtitleの分離 (例: "1‐3 納税地" -> id: "1-3", title: "納税地")
  let id = filename;
  let title = fullTitle;
  
  const titleMatch = fullTitle.match(/^([0-9０-９]+[-\u2010-\u2015\uFF0D][0-9０-９]+)[\s　]+(.*)$/);
  if (titleMatch) {
    // 全角数字や各種ハイフンを半角に正規化しておく
    id = titleMatch[1].replace(/[０-９]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/[-\u2010-\u2015\uFF0D]/g, '-');
    title = titleMatch[2];
  } else if (fullTitle.includes(' ')) {
    const parts = fullTitle.split(' ');
    id = parts[0];
    title = parts.slice(1).join(' ');
  }

  const sections = [];
  // <h3> と次の <h3> または終端までの内容を取得する
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/gi;
  let match;
  
  while ((match = h3Regex.exec(content)) !== null) {
    let headingHtml = match[1];
    let sectionBodyHtml = match[2];
    
    let heading = headingHtml.replace(/<[^>]+>/g, '').trim();
    // ☆をチェック
    let isImportant = heading.includes('☆');
    if (!isImportant && sectionBodyHtml.includes('☆')) {
        isImportant = true;
    }
    
    // 内容のタグを除去し、不要な空白や改行を整理
    let contentText = sectionBodyHtml.replace(/<br\s*\/?>/gi, '\n');
    contentText = contentText.replace(/<\/p>/gi, '\n');
    contentText = contentText.replace(/<[^>]+>/g, '');
    contentText = contentText.replace(/&nbsp;/g, ' ')
                             .replace(/&lt;/g, '<')
                             .replace(/&gt;/g, '>')
                             .replace(/&amp;/g, '&');
                             
    contentText = contentText.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');

    sections.push({
      heading: heading,
      isImportant: isImportant,
      content: contentText
    });
  }

  return {
    id: id,
    title: title,
    fullTitle: fullTitle,
    sections: sections
  };
}
