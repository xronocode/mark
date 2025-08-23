const fs = require('fs');
const path = require('path');

// 翻译文件目录
const localesDir = '/Users/hubo/mycode/marktext/src/shared/i18n/locales';

// 预定义的翻译映射
const translations = {
  'de': {
    // Command Palette
    'commandPalette.placeholders.selectOption': 'Option auswählen',
    'commandPalette.placeholders.searchFileToOpen': 'Datei zum Öffnen suchen',
    'commandPalette.placeholders.selectLanguage': 'Sprache auswählen',
    
    // Edit commands
    'edit.undo': 'Rückgängig',
    'edit.redo': 'Wiederholen',
    'edit.cut': 'Ausschneiden',
    'edit.copy': 'Kopieren',
    'edit.paste': 'Einfügen',
    'edit.selectAll': 'Alles auswählen',
    
    // Commands
    'commands.file.lineEnding': 'Zeilenende',
    'commands.file.close': 'Schließen',
    'commands.edit.mathBlock': 'Mathe-Block',
    'commands.paragraph.mathBlock': 'Mathe-Block',
    'commands.paragraph.horizontalRule': 'Horizontale Linie',
    'commands.window.close': 'Schließen',
    'commands.view.actualSize': 'Tatsächliche Größe',
    'commands.view.zoomIn': 'Vergrößern',
    'commands.view.zoomOut': 'Verkleinern',
    'commands.view.devToggleDeveloperTools': 'Entwicklertools umschalten',
    
    // Quick Insert
    'quickInsert.mermaid.gantt.title': 'Gantt-Diagramm',
    'quickInsert.mermaid.pie.title': 'Kreisdiagramm',
    'quickInsert.mermaid.flowchart.title': 'Flussdiagramm',
    'quickInsert.mermaid.sequence.title': 'Sequenzdiagramm',
    'quickInsert.mermaid.class.title': 'Klassendiagramm',
    'quickInsert.mermaid.state.title': 'Zustandsdiagramm',
    'quickInsert.mermaid.state.subtitle': '',
    'quickInsert.mermaid.journey.title': 'User Journey',
    'quickInsert.mermaid.git.title': 'Git-Diagramm',
    'quickInsert.mermaid.er.title': 'ER-Diagramm',
    'quickInsert.mermaid.requirement.title': 'Anforderungsdiagramm',
    'quickInsert.taskList.title': 'Aufgabenliste',
    'quickInsert.vegaliteChart.title': 'Vega-Lite Diagramm',
    'quickInsert.plantUMLDiagram.title': 'PlantUML Diagramm',
    'quickInsert.mermaidDiagram.title': 'Mermaid Diagramm'
  },
  
  'es': {
    // Command Palette
    'commandPalette.placeholders.selectOption': 'Seleccionar opción',
    'commandPalette.placeholders.searchFileToOpen': 'Buscar archivo para abrir',
    'commandPalette.placeholders.selectLanguage': 'Seleccionar idioma',
    
    // Edit commands
    'edit.undo': 'Deshacer',
    'edit.redo': 'Rehacer',
    'edit.cut': 'Cortar',
    'edit.copy': 'Copiar',
    'edit.paste': 'Pegar',
    'edit.selectAll': 'Seleccionar todo',
    
    // Commands
    'commands.file.lineEnding': 'Final de línea',
    'commands.file.close': 'Cerrar',
    'commands.edit.mathBlock': 'Bloque matemático',
    'commands.paragraph.mathBlock': 'Bloque matemático',
    'commands.paragraph.horizontalRule': 'Línea horizontal',
    'commands.window.close': 'Cerrar',
    'commands.view.actualSize': 'Tamaño real',
    'commands.view.zoomIn': 'Acercar',
    'commands.view.zoomOut': 'Alejar',
    'commands.view.devToggleDeveloperTools': 'Alternar herramientas de desarrollador',
    
    // Quick Insert
    'quickInsert.mermaid.gantt.title': 'Diagrama de Gantt',
    'quickInsert.mermaid.pie.title': 'Gráfico circular',
    'quickInsert.mermaid.flowchart.title': 'Diagrama de flujo',
    'quickInsert.mermaid.sequence.title': 'Diagrama de secuencia',
    'quickInsert.mermaid.class.title': 'Diagrama de clases',
    'quickInsert.mermaid.state.title': 'Diagrama de estados',
    'quickInsert.mermaid.state.subtitle': '',
    'quickInsert.mermaid.journey.title': 'Viaje del usuario',
    'quickInsert.mermaid.git.title': 'Diagrama Git',
    'quickInsert.mermaid.er.title': 'Diagrama ER',
    'quickInsert.mermaid.requirement.title': 'Diagrama de requisitos',
    'quickInsert.taskList.title': 'Lista de tareas',
    'quickInsert.vegaliteChart.title': 'Gráfico Vega-Lite',
    'quickInsert.plantUMLDiagram.title': 'Diagrama PlantUML',
    'quickInsert.mermaidDiagram.title': 'Diagrama Mermaid'
  },
  
  'fr': {
    // Command Palette
    'commandPalette.placeholders.selectOption': 'Sélectionner une option',
    'commandPalette.placeholders.searchFileToOpen': 'Rechercher un fichier à ouvrir',
    'commandPalette.placeholders.selectLanguage': 'Sélectionner la langue',
    
    // Edit commands
    'edit.undo': 'Annuler',
    'edit.redo': 'Rétablir',
    'edit.cut': 'Couper',
    'edit.copy': 'Copier',
    'edit.paste': 'Coller',
    'edit.selectAll': 'Tout sélectionner',
    
    // Commands
    'commands.file.lineEnding': 'Fin de ligne',
    'commands.file.close': 'Fermer',
    'commands.edit.mathBlock': 'Bloc mathématique',
    'commands.paragraph.mathBlock': 'Bloc mathématique',
    'commands.paragraph.horizontalRule': 'Ligne horizontale',
    'commands.window.close': 'Fermer',
    'commands.view.actualSize': 'Taille réelle',
    'commands.view.zoomIn': 'Agrandir',
    'commands.view.zoomOut': 'Réduire',
    'commands.view.devToggleDeveloperTools': 'Basculer les outils de développement',
    
    // Quick Insert
    'quickInsert.mermaid.gantt.title': 'Diagramme de Gantt',
    'quickInsert.mermaid.pie.title': 'Graphique en secteurs',
    'quickInsert.mermaid.flowchart.title': 'Organigramme',
    'quickInsert.mermaid.sequence.title': 'Diagramme de séquence',
    'quickInsert.mermaid.class.title': 'Diagramme de classes',
    'quickInsert.mermaid.state.title': 'Diagramme d\'états',
    'quickInsert.mermaid.state.subtitle': '',
    'quickInsert.mermaid.journey.title': 'Parcours utilisateur',
    'quickInsert.mermaid.git.title': 'Diagramme Git',
    'quickInsert.mermaid.er.title': 'Diagramme ER',
    'quickInsert.mermaid.requirement.title': 'Diagramme d\'exigences',
    'quickInsert.taskList.title': 'Liste de tâches',
    'quickInsert.vegaliteChart.title': 'Graphique Vega-Lite',
    'quickInsert.plantUMLDiagram.title': 'Diagramme PlantUML',
    'quickInsert.mermaidDiagram.title': 'Diagramme Mermaid'
  },
  
  'ja': {
    // Command Palette
    'commandPalette.placeholders.selectOption': 'オプションを選択',
    'commandPalette.placeholders.searchFileToOpen': '開くファイルを検索',
    'commandPalette.placeholders.selectLanguage': '言語を選択',
    
    // Edit commands
    'edit.undo': '元に戻す',
    'edit.redo': 'やり直し',
    'edit.cut': '切り取り',
    'edit.copy': 'コピー',
    'edit.paste': '貼り付け',
    'edit.selectAll': 'すべて選択',
    
    // Commands
    'commands.file.lineEnding': '行末文字',
    'commands.file.close': '閉じる',
    'commands.edit.mathBlock': '数式ブロック',
    'commands.paragraph.mathBlock': '数式ブロック',
    'commands.paragraph.horizontalRule': '水平線',
    'commands.window.close': '閉じる',
    'commands.view.actualSize': '実際のサイズ',
    'commands.view.zoomIn': '拡大',
    'commands.view.zoomOut': '縮小',
    'commands.view.devToggleDeveloperTools': '開発者ツールの切り替え',
    
    // Quick Insert
    'quickInsert.mermaid.gantt.title': 'ガントチャート',
    'quickInsert.mermaid.pie.title': '円グラフ',
    'quickInsert.mermaid.flowchart.title': 'フローチャート',
    'quickInsert.mermaid.sequence.title': 'シーケンス図',
    'quickInsert.mermaid.class.title': 'クラス図',
    'quickInsert.mermaid.state.title': '状態図',
    'quickInsert.mermaid.state.subtitle': '',
    'quickInsert.mermaid.journey.title': 'ユーザージャーニー',
    'quickInsert.mermaid.git.title': 'Git図',
    'quickInsert.mermaid.er.title': 'ER図',
    'quickInsert.mermaid.requirement.title': '要件図',
    'quickInsert.taskList.title': 'タスクリスト',
    'quickInsert.vegaliteChart.title': 'Vega-Liteチャート',
    'quickInsert.plantUMLDiagram.title': 'PlantUML図',
    'quickInsert.mermaidDiagram.title': 'Mermaid図'
  },
  
  'ko': {
    // Command Palette
    'commandPalette.placeholders.selectOption': '옵션 선택',
    'commandPalette.placeholders.searchFileToOpen': '열 파일 검색',
    'commandPalette.placeholders.selectLanguage': '언어 선택',
    
    // Edit commands
    'edit.undo': '실행 취소',
    'edit.redo': '다시 실행',
    'edit.cut': '잘라내기',
    'edit.copy': '복사',
    'edit.paste': '붙여넣기',
    'edit.selectAll': '모두 선택',
    
    // Commands
    'commands.file.lineEnding': '줄 끝',
    'commands.file.close': '닫기',
    'commands.edit.mathBlock': '수식 블록',
    'commands.paragraph.mathBlock': '수식 블록',
    'commands.paragraph.horizontalRule': '수평선',
    'commands.window.close': '닫기',
    'commands.view.actualSize': '실제 크기',
    'commands.view.zoomIn': '확대',
    'commands.view.zoomOut': '축소',
    'commands.view.devToggleDeveloperTools': '개발자 도구 전환',
    
    // Quick Insert
    'quickInsert.mermaid.gantt.title': '간트 차트',
    'quickInsert.mermaid.pie.title': '원형 차트',
    'quickInsert.mermaid.flowchart.title': '순서도',
    'quickInsert.mermaid.sequence.title': '시퀀스 다이어그램',
    'quickInsert.mermaid.class.title': '클래스 다이어그램',
    'quickInsert.mermaid.state.title': '상태 다이어그램',
    'quickInsert.mermaid.state.subtitle': '',
    'quickInsert.mermaid.journey.title': '사용자 여정',
    'quickInsert.mermaid.git.title': 'Git 다이어그램',
    'quickInsert.mermaid.er.title': 'ER 다이어그램',
    'quickInsert.mermaid.requirement.title': '요구사항 다이어그램',
    'quickInsert.taskList.title': '작업 목록',
    'quickInsert.vegaliteChart.title': 'Vega-Lite 차트',
    'quickInsert.plantUMLDiagram.title': 'PlantUML 다이어그램',
    'quickInsert.mermaidDiagram.title': 'Mermaid 다이어그램'
  },
  
  'pt': {
    // Command Palette
    'commandPalette.placeholders.selectOption': 'Selecionar opção',
    'commandPalette.placeholders.searchFileToOpen': 'Pesquisar arquivo para abrir',
    'commandPalette.placeholders.selectLanguage': 'Selecionar idioma',
    
    // Edit commands
    'edit.undo': 'Desfazer',
    'edit.redo': 'Refazer',
    'edit.cut': 'Cortar',
    'edit.copy': 'Copiar',
    'edit.paste': 'Colar',
    'edit.selectAll': 'Selecionar tudo',
    
    // Commands
    'commands.file.lineEnding': 'Final de linha',
    'commands.file.close': 'Fechar',
    'commands.edit.mathBlock': 'Bloco matemático',
    'commands.paragraph.mathBlock': 'Bloco matemático',
    'commands.paragraph.horizontalRule': 'Linha horizontal',
    'commands.window.close': 'Fechar',
    'commands.view.actualSize': 'Tamanho real',
    'commands.view.zoomIn': 'Ampliar',
    'commands.view.zoomOut': 'Reduzir',
    'commands.view.devToggleDeveloperTools': 'Alternar ferramentas de desenvolvedor',
    
    // Quick Insert
    'quickInsert.mermaid.gantt.title': 'Gráfico de Gantt',
    'quickInsert.mermaid.pie.title': 'Gráfico de pizza',
    'quickInsert.mermaid.flowchart.title': 'Fluxograma',
    'quickInsert.mermaid.sequence.title': 'Diagrama de sequência',
    'quickInsert.mermaid.class.title': 'Diagrama de classes',
    'quickInsert.mermaid.state.title': 'Diagrama de estados',
    'quickInsert.mermaid.state.subtitle': '',
    'quickInsert.mermaid.journey.title': 'Jornada do usuário',
    'quickInsert.mermaid.git.title': 'Diagrama Git',
    'quickInsert.mermaid.er.title': 'Diagrama ER',
    'quickInsert.mermaid.requirement.title': 'Diagrama de requisitos',
    'quickInsert.taskList.title': 'Lista de tarefas',
    'quickInsert.vegaliteChart.title': 'Gráfico Vega-Lite',
    'quickInsert.plantUMLDiagram.title': 'Diagrama PlantUML',
    'quickInsert.mermaidDiagram.title': 'Diagrama Mermaid'
  },
  
  'zh-TW': {
    // Command Palette
    'commandPalette.placeholders.selectOption': '選擇選項',
    'commandPalette.placeholders.searchFileToOpen': '搜尋要開啟的檔案',
    'commandPalette.placeholders.selectLanguage': '選擇語言',
    
    // Edit commands
    'edit.undo': '復原',
    'edit.redo': '重做',
    'edit.cut': '剪下',
    'edit.copy': '複製',
    'edit.paste': '貼上',
    'edit.selectAll': '全選',
    
    // Commands
    'commands.file.lineEnding': '行尾字元',
    'commands.file.close': '關閉',
    'commands.edit.mathBlock': '數學區塊',
    'commands.paragraph.mathBlock': '數學區塊',
    'commands.paragraph.horizontalRule': '水平線',
    'commands.window.close': '關閉',
    'commands.view.actualSize': '實際大小',
    'commands.view.zoomIn': '放大',
    'commands.view.zoomOut': '縮小',
    'commands.view.devToggleDeveloperTools': '切換開發者工具',
    
    // Quick Insert
    'quickInsert.mermaid.gantt.title': '甘特圖',
    'quickInsert.mermaid.pie.title': '圓餅圖',
    'quickInsert.mermaid.flowchart.title': '流程圖',
    'quickInsert.mermaid.sequence.title': '序列圖',
    'quickInsert.mermaid.class.title': '類別圖',
    'quickInsert.mermaid.state.title': '狀態圖',
    'quickInsert.mermaid.state.subtitle': '',
    'quickInsert.mermaid.journey.title': '使用者旅程',
    'quickInsert.mermaid.git.title': 'Git 圖表',
    'quickInsert.mermaid.er.title': 'ER 圖',
    'quickInsert.mermaid.requirement.title': '需求圖',
    'quickInsert.taskList.title': '任務清單',
    'quickInsert.vegaliteChart.title': 'Vega-Lite 圖表',
    'quickInsert.plantUMLDiagram.title': 'PlantUML 圖表',
    'quickInsert.mermaidDiagram.title': 'Mermaid 圖表'
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
function autoTranslateMissingKeys() {
  console.log('開始自動翻譯缺失的鍵...');
  
  // 讀取同步報告
  const reportPath = '/Users/hubo/mycode/marktext/temp/translation_sync_report.json';
  const syncReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  
  const translationReport = {
    timestamp: new Date().toLocaleString(),
    processedLanguages: [],
    totalTranslatedKeys: 0,
    summary: {}
  };
  
  // 處理每個語言
  Object.keys(syncReport.languages).forEach(lang => {
    const langData = syncReport.languages[lang];
    
    if (langData.missingKeys === 0) {
      console.log(`✅ ${lang}: 無需翻譯`);
      return;
    }
    
    console.log(`\n處理 ${lang}.json...`);
    
    // 讀取語言文件
    const langFilePath = path.join(localesDir, `${lang}.json`);
    const langContent = JSON.parse(fs.readFileSync(langFilePath, 'utf8'));
    
    let translatedCount = 0;
    const missingTranslations = [];
    
    // 翻譯每個缺失的鍵
    langData.missingKeysList.forEach(key => {
      if (translations[lang] && translations[lang][key]) {
        setValueByPath(langContent, key, translations[lang][key]);
        console.log(`  ✅ 翻譯: ${key} -> ${translations[lang][key]}`);
        translatedCount++;
      } else {
        console.log(`  ⚠️  缺少翻譯: ${key}`);
        missingTranslations.push(key);
      }
    });
    
    // 保存更新後的文件
    fs.writeFileSync(langFilePath, JSON.stringify(langContent, null, 2), 'utf8');
    
    translationReport.processedLanguages.push(lang);
    translationReport.totalTranslatedKeys += translatedCount;
    translationReport.summary[lang] = {
      totalMissingKeys: langData.missingKeys,
      translatedKeys: translatedCount,
      stillMissingKeys: missingTranslations.length,
      stillMissingList: missingTranslations
    };
    
    console.log(`  📊 ${lang}: 翻譯了 ${translatedCount}/${langData.missingKeys} 個鍵`);
  });
  
  // 保存翻譯報告
  const translationReportPath = '/Users/hubo/mycode/marktext/temp/auto_translation_report.json';
  fs.writeFileSync(translationReportPath, JSON.stringify(translationReport, null, 2), 'utf8');
  
  console.log(`\n=== 自動翻譯完成總結 ===`);
  console.log(`處理的語言數: ${translationReport.processedLanguages.length}`);
  console.log(`總翻譯鍵數: ${translationReport.totalTranslatedKeys}`);
  console.log(`詳細報告已保存到: ${translationReportPath}`);
  
  return translationReport;
}

// 執行翻譯
if (require.main === module) {
  try {
    autoTranslateMissingKeys();
  } catch (error) {
    console.error('翻譯過程中發生錯誤:', error);
    process.exit(1);
  }
}

module.exports = { autoTranslateMissingKeys };