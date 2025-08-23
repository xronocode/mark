const fs = require('fs');
const path = require('path');

// 翻译文件目录
const localesDir = '/Users/hubo/mycode/marktext/src/shared/i18n/locales';

// 剩余的翻译映射
const remainingTranslations = {
  'de': {
    'quickInsert.mermaid.state.subtitle': ''
  },
  'es': {
    'quickInsert.mermaid.state.subtitle': ''
  },
  'fr': {
    'quickInsert.mermaid.state.subtitle': '',
    'quickInsert.sequenceChart.title': 'Graphique de séquence'
  },
  'ko': {
    'quickInsert.mathFormula.title': '수학 공식',
    'quickInsert.orderedList.title': '순서 목록',
    'quickInsert.mermaid.state.subtitle': ''
  },
  'pt': {
    'quickInsert.mermaid.state.subtitle': ''
  },
  'zh-TW': {
    'quickInsert.mermaid.state.subtitle': ''
  }
};

// 根據鍵路徑設置嵌套對象的值
function setValueByPath(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}

// 主函數
function completeRemainingTranslations() {
  console.log('完成剩余翻译...');
  
  const completionReport = {
    timestamp: new Date().toLocaleString(),
    processedLanguages: [],
    totalCompletedKeys: 0,
    details: {}
  };
  
  // 處理每個語言的剩余翻译
  Object.keys(remainingTranslations).forEach(lang => {
    const translations = remainingTranslations[lang];
    
    console.log(`\n處理 ${lang}.json 的剩余翻译...`);
    
    // 讀取語言文件
    const langFilePath = path.join(localesDir, `${lang}.json`);
    const langContent = JSON.parse(fs.readFileSync(langFilePath, 'utf8'));
    
    let completedCount = 0;
    const completedKeys = [];
    
    // 添加剩余翻译
    Object.keys(translations).forEach(key => {
      setValueByPath(langContent, key, translations[key]);
      console.log(`  ✅ 完成: ${key} -> "${translations[key]}"`);
      completedCount++;
      completedKeys.push(key);
    });
    
    // 保存更新後的文件
    fs.writeFileSync(langFilePath, JSON.stringify(langContent, null, 2), 'utf8');
    
    completionReport.processedLanguages.push(lang);
    completionReport.totalCompletedKeys += completedCount;
    completionReport.details[lang] = {
      completedKeys: completedCount,
      keysList: completedKeys
    };
    
    console.log(`  📊 ${lang}: 完成了 ${completedCount} 个翻译`);
  });
  
  // 保存完成报告
  const completionReportPath = '/Users/hubo/mycode/marktext/temp/translation_completion_report.json';
  fs.writeFileSync(completionReportPath, JSON.stringify(completionReport, null, 2), 'utf8');
  
  console.log(`\n=== 翻译完成总结 ===`);
  console.log(`处理的语言数: ${completionReport.processedLanguages.length}`);
  console.log(`总完成键数: ${completionReport.totalCompletedKeys}`);
  console.log(`详细报告已保存到: ${completionReportPath}`);
  
  return completionReport;
}

// 執行完成翻译
if (require.main === module) {
  try {
    completeRemainingTranslations();
  } catch (error) {
    console.error('完成翻译过程中发生错误:', error);
    process.exit(1);
  }
}

module.exports = { completeRemainingTranslations };