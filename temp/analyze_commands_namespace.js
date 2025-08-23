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

// 获取对象中所有嵌套键的路径
function getAllKeys(obj, prefix = '') {
  const keys = [];
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        keys.push(...getAllKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    }
  }
  
  return keys;
}

// 分析commands命名空间的键差异
function analyzeCommandsNamespace() {
  const localesDir = '/Users/hubo/mycode/marktext/src/shared/i18n/locales';
  
  // 读取英文和中文翻译文件
  const enData = loadTranslationFile(path.join(localesDir, 'en.json'));
  const zhCNData = loadTranslationFile(path.join(localesDir, 'zh-CN.json'));
  
  if (!enData || !zhCNData) {
    console.error('Failed to load translation files');
    return;
  }
  
  // 获取commands命名空间下的所有键
  const enCommandsKeys = enData.commands ? getAllKeys(enData.commands, 'commands') : [];
  const zhCNCommandsKeys = zhCNData.commands ? getAllKeys(zhCNData.commands, 'commands') : [];
  
  console.log('=== Commands命名空间键分析 ===');
  console.log(`英文文件commands键数量: ${enCommandsKeys.length}`);
  console.log(`中文文件commands键数量: ${zhCNCommandsKeys.length}`);
  
  // 找出中文文件中存在但英文文件中缺失的键
  const missingInEn = zhCNCommandsKeys.filter(key => !enCommandsKeys.includes(key));
  
  if (missingInEn.length > 0) {
    console.log('\n=== 英文文件中缺失的键 ===');
    missingInEn.forEach(key => {
      console.log(`- ${key}`);
    });
    
    console.log('\n=== 缺失键的中文值 ===');
    missingInEn.forEach(key => {
      const keyPath = key.replace('commands.', '').split('.');
      let value = zhCNData.commands;
      
      for (const k of keyPath) {
        if (value && typeof value === 'object' && value.hasOwnProperty(k)) {
          value = value[k];
        } else {
          value = undefined;
          break;
        }
      }
      
      console.log(`${key}: "${value}"`);
    });
  } else {
    console.log('\n✅ 英文文件中没有缺失的commands键');
  }
  
  // 找出英文文件中存在但中文文件中缺失的键
  const missingInZhCN = enCommandsKeys.filter(key => !zhCNCommandsKeys.includes(key));
  
  if (missingInZhCN.length > 0) {
    console.log('\n=== 中文文件中缺失的键 ===');
    missingInZhCN.forEach(key => {
      console.log(`- ${key}`);
    });
  } else {
    console.log('\n✅ 中文文件中没有缺失的commands键');
  }
  
  return {
    missingInEn,
    missingInZhCN,
    enCommandsKeys,
    zhCNCommandsKeys
  };
}

// 执行分析
analyzeCommandsNamespace();