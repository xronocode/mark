const fs = require('fs');
const path = require('path');

// 读取翻译文件
function loadTranslationFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return null;
  }
}

// 保存翻译文件
function saveTranslationFile(filePath, data) {
  try {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error.message);
    return false;
  }
}

// 设置嵌套对象的值
function setNestedValue(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

// 添加缺失的commands键到中文文件
function addMissingCommandsKeyToZhCN() {
  const localesDir = '/Users/hubo/mycode/marktext/src/shared/i18n/locales';
  const zhCNFilePath = path.join(localesDir, 'zh-CN.json');
  
  // 读取中文翻译文件
  const zhCNData = loadTranslationFile(zhCNFilePath);
  
  if (!zhCNData) {
    console.error('Failed to load Chinese translation file');
    return;
  }
  
  // 确保commands命名空间存在
  if (!zhCNData.commands) {
    zhCNData.commands = {};
  }
  
  // 需要添加的键和对应的中文翻译
  const missingKey = 'file.changeLineEnding';
  const chineseTranslation = '更改行结束符';
  
  console.log('=== 添加缺失的commands键到中文文件 ===');
  
  // 检查键是否已存在
  const keyPath = missingKey.split('.');
  let current = zhCNData.commands;
  let exists = true;
  
  for (const k of keyPath) {
    if (!current || typeof current !== 'object' || !current.hasOwnProperty(k)) {
      exists = false;
      break;
    }
    current = current[k];
  }
  
  if (!exists) {
    setNestedValue(zhCNData.commands, missingKey, chineseTranslation);
    console.log(`✅ 添加: commands.${missingKey} = "${chineseTranslation}"`);
    
    // 保存更新后的中文文件
    if (saveTranslationFile(zhCNFilePath, zhCNData)) {
      console.log('\n🎉 成功向中文文件添加了 1 个commands键');
    } else {
      console.error('❌ 保存中文文件失败');
    }
  } else {
    console.log(`⚠️  已存在: commands.${missingKey}`);
    console.log('\n✅ 键已存在，无需添加');
  }
}

// 执行添加操作
addMissingCommandsKeyToZhCN();