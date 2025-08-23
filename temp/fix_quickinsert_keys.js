const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/shared/i18n/locales');

// 读取英语和中文文件
const enContent = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
const zhContent = JSON.parse(fs.readFileSync(path.join(localesDir, 'zh-CN.json'), 'utf8'));

// 需要删除的多余键
const keysToRemove = [
  'todoList',
  'vegaChart', 
  'sequenceDiagram',
  'plantumlDiagram',
  'plantUMLChart'
];

console.log('=== 修复 quickInsert 键不一致问题 ===');
console.log('删除英语和中文文件中的多余键...');

// 从英语文件中删除多余键
keysToRemove.forEach(key => {
  if (enContent.quickInsert && enContent.quickInsert[key]) {
    console.log(`删除英语文件中的键: quickInsert.${key}`);
    delete enContent.quickInsert[key];
  }
});

// 删除英语文件中的 mermaid.title 和 mermaid.subtitle（保留mermaid子对象）
if (enContent.quickInsert && enContent.quickInsert.mermaid) {
  if (enContent.quickInsert.mermaid.title) {
    console.log('删除英语文件中的键: quickInsert.mermaid.title');
    delete enContent.quickInsert.mermaid.title;
  }
  if (enContent.quickInsert.mermaid.subtitle) {
    console.log('删除英语文件中的键: quickInsert.mermaid.subtitle');
    delete enContent.quickInsert.mermaid.subtitle;
  }
}

// 从中文文件中删除多余键
keysToRemove.forEach(key => {
  if (zhContent.quickInsert && zhContent.quickInsert[key]) {
    console.log(`删除中文文件中的键: quickInsert.${key}`);
    delete zhContent.quickInsert[key];
  }
});

// 删除中文文件中的 mermaid.title 和 mermaid.subtitle（保留mermaid子对象）
if (zhContent.quickInsert && zhContent.quickInsert.mermaid) {
  if (zhContent.quickInsert.mermaid.title) {
    console.log('删除中文文件中的键: quickInsert.mermaid.title');
    delete zhContent.quickInsert.mermaid.title;
  }
  if (zhContent.quickInsert.mermaid.subtitle) {
    console.log('删除中文文件中的键: quickInsert.mermaid.subtitle');
    delete zhContent.quickInsert.mermaid.subtitle;
  }
}

// 写回文件
fs.writeFileSync(path.join(localesDir, 'en.json'), JSON.stringify(enContent, null, 2), 'utf8');
fs.writeFileSync(path.join(localesDir, 'zh-CN.json'), JSON.stringify(zhContent, null, 2), 'utf8');

console.log('\n修复完成！');
console.log('已删除英语和中文文件中的多余键，现在应该与日语文件保持一致。');