const fs = require('fs');
const path = require('path');

// 翻译文件目录
const localesDir = path.join(__dirname, 'src/shared/i18n/locales');

// 需要添加的翻译键和对应的翻译
const placeholderTranslations = {
  'de': {
    'frontMatter': 'YAML Front Matter eingeben...',
    'languageIdentifier': 'Sprachkennung eingeben...',
    'mathFormula': 'Mathematische Formel eingeben...'
  },
  'es': {
    'frontMatter': 'Introducir YAML Front Matter...',
    'languageIdentifier': 'Introducir identificador de idioma...',
    'mathFormula': 'Introducir fórmula matemática...'
  },
  'fr': {
    'frontMatter': 'Saisir YAML Front Matter...',
    'languageIdentifier': 'Saisir l\'identifiant de langue...',
    'mathFormula': 'Saisir une formule mathématique...'
  },
  'ja': {
    'frontMatter': 'YAML フロントマターを入力...',
    'languageIdentifier': '言語識別子を入力...',
    'mathFormula': '数式を入力...'
  },
  'ko': {
    'frontMatter': 'YAML 프론트 매터 입력...',
    'languageIdentifier': '언어 식별자 입력...',
    'mathFormula': '수학 공식 입력...'
  },
  'pt': {
    'frontMatter': 'Inserir YAML Front Matter...',
    'languageIdentifier': 'Inserir identificador de idioma...',
    'mathFormula': 'Inserir fórmula matemática...'
  },
  'zh-TW': {
    'frontMatter': '輸入 YAML 前置資訊...',
    'languageIdentifier': '輸入語言識別符...',
    'mathFormula': '輸入數學公式...'
  }
};

// 获取所有翻译文件
const translationFiles = fs.readdirSync(localesDir)
  .filter(file => file.endsWith('.json') && !['en.json', 'zh-CN.json'].includes(file))
  .map(file => path.join(localesDir, file));

console.log('为以下语言文件添加编辑器占位符翻译:');
console.log(translationFiles.map(f => path.basename(f)).join(', '));

// 为每个语言文件添加翻译
for (const filePath of translationFiles) {
  const fileName = path.basename(filePath, '.json');
  const translations = placeholderTranslations[fileName];
  
  if (!translations) {
    console.log(`跳过 ${fileName}.json - 没有对应的翻译`);
    continue;
  }
  
  try {
    // 读取现有文件
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // 确保 editor 对象存在
    if (!data.editor) {
      data.editor = {};
    }
    
    // 添加 placeholders 对象
    data.editor.placeholders = {
      frontMatter: translations.frontMatter,
      languageIdentifier: translations.languageIdentifier,
      mathFormula: translations.mathFormula
    };
    
    // 写回文件
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✓ 已更新 ${fileName}.json`);
    
  } catch (error) {
    console.error(`✗ 更新 ${fileName}.json 失败:`, error.message);
  }
}

console.log('\n编辑器占位符翻译添加完成!');