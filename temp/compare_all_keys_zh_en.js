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

// 获取对象的所有键路径
function getAllKeys(obj, prefix = '') {
  const keys = [];
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        // 递归处理嵌套对象
        keys.push(...getAllKeys(obj[key], fullKey));
      } else {
        // 叶子节点
        keys.push(fullKey);
      }
    }
  }
  
  return keys;
}

// 获取嵌套对象的值
function getNestedValue(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && current.hasOwnProperty(key)) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  
  return current;
}

// 对比两个翻译文件的所有键
function compareAllKeys() {
  const localesDir = '/Users/hubo/mycode/marktext/src/shared/i18n/locales';
  const enFilePath = path.join(localesDir, 'en.json');
  const zhCNFilePath = path.join(localesDir, 'zh-CN.json');
  
  console.log('=== 中英文翻译文件键名全面对比分析 ===\n');
  
  // 读取翻译文件
  const enData = loadTranslationFile(enFilePath);
  const zhCNData = loadTranslationFile(zhCNFilePath);
  
  if (!enData || !zhCNData) {
    console.error('❌ 无法读取翻译文件');
    return;
  }
  
  // 获取所有键
  const enKeys = getAllKeys(enData);
  const zhCNKeys = getAllKeys(zhCNData);
  
  console.log(`📊 键数量统计:`);
  console.log(`   英文文件总键数: ${enKeys.length}`);
  console.log(`   中文文件总键数: ${zhCNKeys.length}`);
  console.log(`   差异数量: ${Math.abs(enKeys.length - zhCNKeys.length)}\n`);
  
  // 转换为Set以便快速查找
  const enKeySet = new Set(enKeys);
  const zhCNKeySet = new Set(zhCNKeys);
  
  // 找出英文文件中缺失的键（中文有，英文没有）
  const missingInEn = zhCNKeys.filter(key => !enKeySet.has(key));
  
  // 找出中文文件中缺失的键（英文有，中文没有）
  const missingInZhCN = enKeys.filter(key => !zhCNKeySet.has(key));
  
  // 找出共同的键
  const commonKeys = enKeys.filter(key => zhCNKeySet.has(key));
  
  // 输出英文文件缺失的键
  if (missingInEn.length > 0) {
    console.log(`🔍 英文文件中缺失的键 (${missingInEn.length}个):`);
    missingInEn.sort().forEach(key => {
      const zhValue = getNestedValue(zhCNData, key);
      console.log(`   - ${key}: "${zhValue}"`);
    });
    console.log();
  } else {
    console.log('✅ 英文文件中没有缺失的键\n');
  }
  
  // 输出中文文件缺失的键
  if (missingInZhCN.length > 0) {
    console.log(`🔍 中文文件中缺失的键 (${missingInZhCN.length}个):`);
    missingInZhCN.sort().forEach(key => {
      const enValue = getNestedValue(enData, key);
      console.log(`   - ${key}: "${enValue}"`);
    });
    console.log();
  } else {
    console.log('✅ 中文文件中没有缺失的键\n');
  }
  
  // 按命名空间分组分析差异
  console.log('📋 按命名空间分组的差异分析:');
  
  // 获取所有命名空间
  const allNamespaces = new Set();
  [...enKeys, ...zhCNKeys].forEach(key => {
    const namespace = key.split('.')[0];
    allNamespaces.add(namespace);
  });
  
  // 按命名空间分析
  Array.from(allNamespaces).sort().forEach(namespace => {
    const enNamespaceKeys = enKeys.filter(key => key.startsWith(namespace + '.') || key === namespace);
    const zhCNNamespaceKeys = zhCNKeys.filter(key => key.startsWith(namespace + '.') || key === namespace);
    
    const enNamespaceSet = new Set(enNamespaceKeys);
    const zhCNNamespaceSet = new Set(zhCNNamespaceKeys);
    
    const namespaceMissingInEn = zhCNNamespaceKeys.filter(key => !enNamespaceSet.has(key));
    const namespaceMissingInZhCN = enNamespaceKeys.filter(key => !zhCNNamespaceSet.has(key));
    
    if (namespaceMissingInEn.length > 0 || namespaceMissingInZhCN.length > 0) {
      console.log(`\n   📁 ${namespace} 命名空间:`);
      console.log(`      英文键数: ${enNamespaceKeys.length}, 中文键数: ${zhCNNamespaceKeys.length}`);
      
      if (namespaceMissingInEn.length > 0) {
        console.log(`      英文缺失 (${namespaceMissingInEn.length}个): ${namespaceMissingInEn.join(', ')}`);
      }
      
      if (namespaceMissingInZhCN.length > 0) {
        console.log(`      中文缺失 (${namespaceMissingInZhCN.length}个): ${namespaceMissingInZhCN.join(', ')}`);
      }
    }
  });
  
  // 检查键值差异（相同键但值不同的情况）
  console.log('\n🔄 键值差异检查:');
  let valueDifferences = 0;
  
  commonKeys.forEach(key => {
    const enValue = getNestedValue(enData, key);
    const zhValue = getNestedValue(zhCNData, key);
    
    // 检查是否都是字符串类型且不为空
    if (typeof enValue === 'string' && typeof zhValue === 'string' && 
        enValue.trim() !== '' && zhValue.trim() !== '') {
      // 这里可以添加更复杂的值差异检查逻辑
      // 目前只统计有值的键
      valueDifferences++;
    }
  });
  
  console.log(`   共同键数量: ${commonKeys.length}`);
  console.log(`   有效翻译对数量: ${valueDifferences}`);
  
  // 总结
  console.log('\n📈 总结报告:');
  console.log(`   总体一致性: ${missingInEn.length === 0 && missingInZhCN.length === 0 ? '✅ 完全一致' : '❌ 存在差异'}`);
  console.log(`   需要补充到英文文件的键: ${missingInEn.length}个`);
  console.log(`   需要补充到中文文件的键: ${missingInZhCN.length}个`);
  console.log(`   建议优先处理: ${missingInEn.length > missingInZhCN.length ? '英文文件缺失键' : '中文文件缺失键'}`);
}

// 执行对比分析
compareAllKeys();