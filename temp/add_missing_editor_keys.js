const fs = require('fs');
const path = require('path');

// 文件路径
const enFilePath = path.join(__dirname, '../src/shared/i18n/locales/en.json');
const zhFilePath = path.join(__dirname, '../src/shared/i18n/locales/zh-CN.json');

// 缺失的键和对应的翻译
const missingKeys = {
  'spellcheck.disabled': {
    en: 'Spellcheck disabled',
    zh: '拼写检查已禁用'
  },
  'spellcheck.enabled': {
    en: 'Spellcheck enabled', 
    zh: '拼写检查已启用'
  },
  'spellcheck.enabledError': {
    en: 'Error enabling spellcheck',
    zh: '启用拼写检查时出错'
  }
};

// 添加缺失键到指定文件
function addMissingKeysToFile(filePath, translations, language) {
  console.log(`\n处理文件: ${filePath}`);
  
  // 读取现有文件
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // 确保editor.spellcheck命名空间存在
  if (!content.editor) {
    content.editor = {};
  }
  if (!content.editor.spellcheck) {
    content.editor.spellcheck = {};
  }
  
  // 添加缺失的键
  let addedCount = 0;
  Object.entries(missingKeys).forEach(([key, values]) => {
    const keyParts = key.split('.');
    const finalKey = keyParts[keyParts.length - 1];
    
    if (!content.editor.spellcheck[finalKey]) {
      content.editor.spellcheck[finalKey] = values[language];
      console.log(`  添加键: editor.spellcheck.${finalKey} = "${values[language]}"`);
      addedCount++;
    } else {
      console.log(`  键已存在: editor.spellcheck.${finalKey}`);
    }
  });
  
  if (addedCount > 0) {
    // 写回文件
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
    console.log(`  成功添加 ${addedCount} 个键到 ${language} 文件`);
  } else {
    console.log(`  ${language} 文件无需更新`);
  }
  
  return addedCount;
}

console.log('=== 添加缺失的editor.spellcheck键 ===');

// 处理英文文件
const enAdded = addMissingKeysToFile(enFilePath, missingKeys, 'en');

// 处理中文文件
const zhAdded = addMissingKeysToFile(zhFilePath, missingKeys, 'zh');

console.log(`\n=== 总结 ===`);
console.log(`英文文件添加了 ${enAdded} 个键`);
console.log(`中文文件添加了 ${zhAdded} 个键`);

if (enAdded > 0 || zhAdded > 0) {
  console.log('\n✅ 成功补足缺失的editor命名空间键');
} else {
  console.log('\n✅ 所有文件都已是最新状态');
}