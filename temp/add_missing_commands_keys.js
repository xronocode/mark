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

// 添加缺失的commands键到英文文件
function addMissingCommandsKeys() {
  const localesDir = '/Users/hubo/mycode/marktext/src/shared/i18n/locales';
  const enFilePath = path.join(localesDir, 'en.json');
  
  // 读取英文翻译文件
  const enData = loadTranslationFile(enFilePath);
  
  if (!enData) {
    console.error('Failed to load English translation file');
    return;
  }
  
  // 确保commands命名空间存在
  if (!enData.commands) {
    enData.commands = {};
  }
  
  // 需要添加的键和对应的英文翻译
  const missingKeys = {
    'file.lineEnding': 'Line Ending',
    'file.close': 'Close',
    'edit.mathBlock': 'Math Block',
    'paragraph.mathBlock': 'Math Block',
    'paragraph.horizontalRule': 'Horizontal Rule',
    'view.actualSize': 'Actual Size',
    'view.zoomIn': 'Zoom In',
    'view.zoomOut': 'Zoom Out',
    'view.devToggleDeveloperTools': 'Toggle Developer Tools'
  };
  
  console.log('=== 添加缺失的commands键到英文文件 ===');
  
  let addedCount = 0;
  
  for (const [key, value] of Object.entries(missingKeys)) {
    const fullKey = `commands.${key}`;
    
    // 检查键是否已存在
    const keyPath = key.split('.');
    let current = enData.commands;
    let exists = true;
    
    for (const k of keyPath) {
      if (!current || typeof current !== 'object' || !current.hasOwnProperty(k)) {
        exists = false;
        break;
      }
      current = current[k];
    }
    
    if (!exists) {
      setNestedValue(enData.commands, key, value);
      console.log(`✅ 添加: ${fullKey} = "${value}"`);
      addedCount++;
    } else {
      console.log(`⚠️  已存在: ${fullKey}`);
    }
  }
  
  if (addedCount > 0) {
    // 保存更新后的英文文件
    if (saveTranslationFile(enFilePath, enData)) {
      console.log(`\n🎉 成功向英文文件添加了 ${addedCount} 个commands键`);
    } else {
      console.error('❌ 保存英文文件失败');
    }
  } else {
    console.log('\n✅ 所有键都已存在，无需添加');
  }
}

// 执行添加操作
addMissingCommandsKeys();