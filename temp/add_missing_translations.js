const fs = require('fs');
const path = require('path');

// 语言文件路径
const localesDir = '/Users/hubo/mycode/marktext/src/shared/i18n/locales';

// 基准语言（简体中文）
const baseLanguage = 'zh-CN';

// 需要补充的翻译映射
const translationMappings = {
  // PicGo检测相关翻译
  'preferences.image.uploader.picgoDetection': {
    'zh-CN': 'PicGo 检测',
    'zh-TW': 'PicGo 偵測',
    'en': 'PicGo Detection',
    'de': 'PicGo-Erkennung',
    'es': 'Detección de PicGo',
    'fr': 'Détection PicGo',
    'ja': 'PicGo検出',
    'ko': 'PicGo 감지',
    'pt': 'Detecção do PicGo'
  },
  'preferences.image.uploader.autoDetection': {
    'zh-CN': '自动检测中',
    'zh-TW': '自動偵測中',
    'en': 'Auto detecting',
    'de': 'Automatische Erkennung',
    'es': 'Detección automática',
    'fr': 'Détection automatique',
    'ja': '自動検出中',
    'ko': '자동 감지 중',
    'pt': 'Detecção automática'
  },
  'preferences.image.uploader.lastSuccessTime': {
    'zh-CN': '上次成功时间',
    'zh-TW': '上次成功時間',
    'en': 'Last success time',
    'de': 'Letzte erfolgreiche Zeit',
    'es': 'Última vez exitosa',
    'fr': 'Dernière heure de succès',
    'ja': '最後の成功時刻',
    'ko': '마지막 성공 시간',
    'pt': 'Última vez bem-sucedida'
  },
  'preferences.image.uploader.neverDetected': {
    'zh-CN': '从未检测',
    'zh-TW': '從未偵測',
    'en': 'Never detected',
    'de': 'Nie erkannt',
    'es': 'Nunca detectado',
    'fr': 'Jamais détecté',
    'ja': '検出されたことがない',
    'ko': '감지된 적 없음',
    'pt': 'Nunca detectado'
  },
  'preferences.image.uploader.neverSuccessful': {
    'zh-CN': '从未成功',
    'zh-TW': '從未成功',
    'en': 'Never successful',
    'de': 'Nie erfolgreich',
    'es': 'Nunca exitoso',
    'fr': 'Jamais réussi',
    'ja': '成功したことがない',
    'ko': '성공한 적 없음',
    'pt': 'Nunca bem-sucedido'
  },
  // QuickInsert相关翻译
  'quickInsert.basicBlock': {
    'zh-CN': '基础块',
    'zh-TW': '基礎塊',
    'en': 'Basic Block',
    'de': 'Grundblock',
    'es': 'Bloque Básico',
    'fr': 'Bloc de base',
    'ja': '基本ブロック',
    'ko': '기본 블록',
    'pt': 'Bloco Básico'
  },
  'quickInsert.advancedBlock': {
    'zh-CN': '高级块',
    'zh-TW': '高級塊',
    'en': 'Advanced Block',
    'de': 'Erweiterter Block',
    'es': 'Bloque Avanzado',
    'fr': 'Bloc avancé',
    'ja': '高度なブロック',
    'ko': '고급 블록',
    'pt': 'Bloco Avançado'
  },
  'quickInsert.listBlock': {
    'zh-CN': '列表块',
    'zh-TW': '列表塊',
    'en': 'List Block',
    'de': 'Listenblock',
    'es': 'Bloque de Lista',
    'fr': 'Bloc de liste',
    'ja': 'リストブロック',
    'ko': '목록 블록',
    'pt': 'Bloco de Lista'
  },
  'quickInsert.diagram': {
    'zh-CN': '图表',
    'zh-TW': '圖表',
    'en': 'Diagram',
    'de': 'Diagramm',
    'es': 'Diagrama',
    'fr': 'Diagramme',
    'ja': '図表',
    'ko': '다이어그램',
    'pt': 'Diagrama'
  },
  // QuickInsert subtitle翻译
  'quickInsert.paragraph.subtitle': {
    'zh-CN': '输入文本内容',
    'zh-TW': '輸入文字內容',
    'en': 'Enter text content',
    'de': 'Textinhalt eingeben',
    'es': 'Ingrese contenido de texto',
    'fr': 'Saisir le contenu du texte',
    'ja': 'テキスト内容を入力',
    'ko': '텍스트 내용 입력',
    'pt': 'Digite o conteúdo do texto'
  },
  'quickInsert.horizontalLine.subtitle': {
    'zh-CN': '---',
    'zh-TW': '---',
    'en': '---',
    'de': '---',
    'es': '---',
    'fr': '---',
    'ja': '---',
    'ko': '---',
    'pt': '---'
  },
  'quickInsert.frontMatter.subtitle': {
    'zh-CN': '--- YAML ---',
    'zh-TW': '--- YAML ---',
    'en': '--- YAML ---',
    'de': '--- YAML ---',
    'es': '--- YAML ---',
    'fr': '--- YAML ---',
    'ja': '--- YAML ---',
    'ko': '--- YAML ---',
    'pt': '--- YAML ---'
  },
  'quickInsert.header1.subtitle': {
    'zh-CN': '# 标题',
    'zh-TW': '# 標題',
    'en': '# Heading',
    'de': '# Überschrift',
    'es': '# Encabezado',
    'fr': '# Titre',
    'ja': '# 見出し',
    'ko': '# 제목',
    'pt': '# Cabeçalho'
  },
  'quickInsert.header2.subtitle': {
    'zh-CN': '## 标题',
    'zh-TW': '## 標題',
    'en': '## Heading',
    'de': '## Überschrift',
    'es': '## Encabezado',
    'fr': '## Titre',
    'ja': '## 見出し',
    'ko': '## 제목',
    'pt': '## Cabeçalho'
  },
  'quickInsert.header3.subtitle': {
    'zh-CN': '### 标题',
    'zh-TW': '### 標題',
    'en': '### Heading',
    'de': '### Überschrift',
    'es': '### Encabezado',
    'fr': '### Titre',
    'ja': '### 見出し',
    'ko': '### 제목',
    'pt': '### Cabeçalho'
  },
  'quickInsert.header4.subtitle': {
    'zh-CN': '#### 标题',
    'zh-TW': '#### 標題',
    'en': '#### Heading',
    'de': '#### Überschrift',
    'es': '#### Encabezado',
    'fr': '#### Titre',
    'ja': '#### 見出し',
    'ko': '#### 제목',
    'pt': '#### Cabeçalho'
  },
  'quickInsert.header5.subtitle': {
    'zh-CN': '##### 标题',
    'zh-TW': '##### 標題',
    'en': '##### Heading',
    'de': '##### Überschrift',
    'es': '##### Encabezado',
    'fr': '##### Titre',
    'ja': '##### 見出し',
    'ko': '##### 제목',
    'pt': '##### Cabeçalho'
  },
  'quickInsert.header6.subtitle': {
    'zh-CN': '###### 标题',
    'zh-TW': '###### 標題',
    'en': '###### Heading',
    'de': '###### Überschrift',
    'es': '###### Encabezado',
    'fr': '###### Titre',
    'ja': '###### 見出し',
    'ko': '###### 제목',
    'pt': '###### Cabeçalho'
  },
  'quickInsert.tableBlock.subtitle': {
    'zh-CN': '| 标题 | 标题 |',
    'zh-TW': '| 標題 | 標題 |',
    'en': '| Header | Header |',
    'de': '| Kopfzeile | Kopfzeile |',
    'es': '| Encabezado | Encabezado |',
    'fr': '| En-tête | En-tête |',
    'ja': '| ヘッダー | ヘッダー |',
    'ko': '| 헤더 | 헤더 |',
    'pt': '| Cabeçalho | Cabeçalho |'
  },
  'quickInsert.mathFormula.subtitle': {
    'zh-CN': '$$ 公式 $$',
    'zh-TW': '$$ 公式 $$',
    'en': '$$ Formula $$',
    'de': '$$ Formel $$',
    'es': '$$ Fórmula $$',
    'fr': '$$ Formule $$',
    'ja': '$$ 数式 $$',
    'ko': '$$ 공식 $$',
    'pt': '$$ Fórmula $$'
  },
  'quickInsert.htmlBlock.subtitle': {
    'zh-CN': '<div> HTML </div>',
    'zh-TW': '<div> HTML </div>',
    'en': '<div> HTML </div>',
    'de': '<div> HTML </div>',
    'es': '<div> HTML </div>',
    'fr': '<div> HTML </div>',
    'ja': '<div> HTML </div>',
    'ko': '<div> HTML </div>',
    'pt': '<div> HTML </div>'
  },
  'quickInsert.codeBlock.subtitle': {
    'zh-CN': '``` 代码 ```',
    'zh-TW': '``` 程式碼 ```',
    'en': '``` Code ```',
    'de': '``` Code ```',
    'es': '``` Código ```',
    'fr': '``` Code ```',
    'ja': '``` コード ```',
    'ko': '``` 코드 ```',
    'pt': '``` Código ```'
  },
  'quickInsert.quoteBlock.subtitle': {
    'zh-CN': '> 引用内容',
    'zh-TW': '> 引用內容',
    'en': '> Quote content',
    'de': '> Zitat Inhalt',
    'es': '> Contenido de cita',
    'fr': '> Contenu de citation',
    'ja': '> 引用内容',
    'ko': '> 인용 내용',
    'pt': '> Conteúdo da citação'
  },
  'quickInsert.orderedList.subtitle': {
    'zh-CN': '1. 列表项',
    'zh-TW': '1. 列表項',
    'en': '1. List item',
    'de': '1. Listenelement',
    'es': '1. Elemento de lista',
    'fr': '1. Élément de liste',
    'ja': '1. リスト項目',
    'ko': '1. 목록 항목',
    'pt': '1. Item da lista'
  },
  'quickInsert.bulletList.subtitle': {
    'zh-CN': '- 列表项',
    'zh-TW': '- 列表項',
    'en': '- List item',
    'de': '- Listenelement',
    'es': '- Elemento de lista',
    'fr': '- Élément de liste',
    'ja': '- リスト項目',
    'ko': '- 목록 항목',
    'pt': '- Item da lista'
  },
  'quickInsert.todoList.title': {
    'zh-CN': '任务列表',
    'zh-TW': '任務列表',
    'en': 'Task List',
    'de': 'Aufgabenliste',
    'es': 'Lista de Tareas',
    'fr': 'Liste de tâches',
    'ja': 'タスクリスト',
    'ko': '작업 목록',
    'pt': 'Lista de Tarefas'
  },
  'quickInsert.todoList.subtitle': {
    'zh-CN': '- [ ] 任务项',
    'zh-TW': '- [ ] 任務項',
    'en': '- [ ] Task item',
    'de': '- [ ] Aufgabe',
    'es': '- [ ] Elemento de tarea',
    'fr': '- [ ] Élément de tâche',
    'ja': '- [ ] タスク項目',
    'ko': '- [ ] 작업 항목',
    'pt': '- [ ] Item de tarefa'
  },
  'quickInsert.flowChart.subtitle': {
    'zh-CN': '流程图表',
    'zh-TW': '流程圖表',
    'en': 'Flow chart',
    'de': 'Flussdiagramm',
    'es': 'Diagrama de flujo',
    'fr': 'Diagramme de flux',
    'ja': 'フローチャート',
    'ko': '순서도',
    'pt': 'Fluxograma'
  },
  'quickInsert.sequenceChart.subtitle': {
    'zh-CN': '时序图表',
    'zh-TW': '時序圖表',
    'en': 'Sequence chart',
    'de': 'Sequenzdiagramm',
    'es': 'Diagrama de secuencia',
    'fr': 'Diagramme de séquence',
    'ja': 'シーケンス図',
    'ko': '시퀀스 다이어그램',
    'pt': 'Diagrama de sequência'
  },
  'quickInsert.mermaid.title': {
    'zh-CN': 'Mermaid图表',
    'zh-TW': 'Mermaid圖表',
    'en': 'Mermaid Chart',
    'de': 'Mermaid-Diagramm',
    'es': 'Gráfico Mermaid',
    'fr': 'Graphique Mermaid',
    'ja': 'Mermaidチャート',
    'ko': 'Mermaid 차트',
    'pt': 'Gráfico Mermaid'
  },
  'quickInsert.mermaid.subtitle': {
    'zh-CN': 'Mermaid图表',
    'zh-TW': 'Mermaid圖表',
    'en': 'Mermaid chart',
    'de': 'Mermaid-Diagramm',
    'es': 'Gráfico Mermaid',
    'fr': 'Graphique Mermaid',
    'ja': 'Mermaidチャート',
    'ko': 'Mermaid 차트',
    'pt': 'Gráfico Mermaid'
  },
  'quickInsert.mermaid.state.subtitle': {
    'zh-CN': 'stateDiagram',
    'zh-TW': 'stateDiagram',
    'en': 'stateDiagram',
    'de': 'stateDiagram',
    'es': 'stateDiagram',
    'fr': 'stateDiagram',
    'ja': 'stateDiagram',
    'ko': 'stateDiagram',
    'pt': 'stateDiagram'
  },
  'quickInsert.taskList.title': {
    'zh-CN': '任务列表',
    'zh-TW': '任務列表',
    'en': 'Task List',
    'de': 'Aufgabenliste',
    'es': 'Lista de Tareas',
    'fr': 'Liste de tâches',
    'ja': 'タスクリスト',
    'ko': '작업 목록',
    'pt': 'Lista de Tarefas'
  },
  'quickInsert.vegaliteChart.title': {
    'zh-CN': 'Vega-Lite图表',
    'zh-TW': 'Vega-Lite圖表',
    'en': 'Vega-Lite Chart',
    'de': 'Vega-Lite-Diagramm',
    'es': 'Gráfico Vega-Lite',
    'fr': 'Graphique Vega-Lite',
    'ja': 'Vega-Liteチャート',
    'ko': 'Vega-Lite 차트',
    'pt': 'Gráfico Vega-Lite'
  },
  'quickInsert.plantUMLDiagram.title': {
    'zh-CN': 'PlantUML图表',
    'zh-TW': 'PlantUML圖表',
    'en': 'PlantUML Diagram',
    'de': 'PlantUML-Diagramm',
    'es': 'Diagrama PlantUML',
    'fr': 'Diagramme PlantUML',
    'ja': 'PlantUML図表',
    'ko': 'PlantUML 다이어그램',
    'pt': 'Diagrama PlantUML'
  },
  'quickInsert.mermaidDiagram.title': {
    'zh-CN': 'Mermaid图表',
    'zh-TW': 'Mermaid圖表',
    'en': 'Mermaid Diagram',
    'de': 'Mermaid-Diagramm',
    'es': 'Diagrama Mermaid',
    'fr': 'Diagramme Mermaid',
    'ja': 'Mermaid図表',
    'ko': 'Mermaid 다이어그램',
    'pt': 'Diagrama Mermaid'
  },
  'quickInsert.plantUMLChart.title': {
    'zh-CN': 'PlantUML图表',
    'zh-TW': 'PlantUML圖表',
    'en': 'PlantUML Chart',
    'de': 'PlantUML-Diagramm',
    'es': 'Gráfico PlantUML',
    'fr': 'Graphique PlantUML',
    'ja': 'PlantUMLチャート',
    'ko': 'PlantUML 차트',
    'pt': 'Gráfico PlantUML'
  },
  'quickInsert.plantUMLChart.subtitle': {
    'zh-CN': 'UML图表',
    'zh-TW': 'UML圖表',
    'en': 'UML chart',
    'de': 'UML-Diagramm',
    'es': 'Gráfico UML',
    'fr': 'Graphique UML',
    'ja': 'UMLチャート',
    'ko': 'UML 차트',
    'pt': 'Gráfico UML'
  }
};

// 设置嵌套对象的值
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

// 获取嵌套对象的值
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  
  return current;
}

// 主函数
function addMissingTranslations() {
  const languages = ['zh-CN', 'zh-TW', 'en', 'de', 'es', 'fr', 'ja', 'ko', 'pt'];
  const results = {
    summary: {
      totalKeysAdded: 0,
      languagesUpdated: 0,
      timestamp: new Date().toISOString()
    },
    details: {}
  };

  languages.forEach(lang => {
    const filePath = path.join(localesDir, `${lang}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`警告: 语言文件 ${filePath} 不存在`);
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      let keysAdded = 0;
      const addedKeys = [];

      // 遍历所有需要补充的翻译
      Object.entries(translationMappings).forEach(([keyPath, translations]) => {
        if (translations[lang]) {
          const currentValue = getNestedValue(data, keyPath);
          
          // 如果键不存在或值为空，则添加翻译
          if (currentValue === undefined || currentValue === '') {
            setNestedValue(data, keyPath, translations[lang]);
            keysAdded++;
            addedKeys.push(keyPath);
            console.log(`${lang}: 添加 ${keyPath} = "${translations[lang]}"`);
          }
        }
      });

      // 如果有更新，保存文件
      if (keysAdded > 0) {
        const updatedContent = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`✅ ${lang}: 成功添加 ${keysAdded} 个翻译键值`);
        
        results.summary.languagesUpdated++;
        results.summary.totalKeysAdded += keysAdded;
        results.details[lang] = {
          keysAdded,
          addedKeys
        };
      } else {
        console.log(`ℹ️  ${lang}: 无需添加翻译键值`);
        results.details[lang] = {
          keysAdded: 0,
          addedKeys: []
        };
      }
    } catch (error) {
      console.error(`❌ 处理 ${lang} 文件时出错:`, error.message);
      results.details[lang] = {
        error: error.message
      };
    }
  });

  // 保存结果报告
  const reportPath = '/Users/hubo/mycode/marktext/temp/missing_translations_added_report.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  
  console.log('\n📊 补充翻译完成总结:');
  console.log(`- 总计添加键值: ${results.summary.totalKeysAdded}`);
  console.log(`- 更新语言文件: ${results.summary.languagesUpdated}`);
  console.log(`- 详细报告已保存到: ${reportPath}`);
  
  return results;
}

// 执行脚本
if (require.main === module) {
  addMissingTranslations();
}

module.exports = { addMissingTranslations };