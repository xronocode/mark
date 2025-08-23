const fs = require('fs');
const path = require('path');

// 翻译文件目录
const localesDir = path.join(__dirname, '..', 'src', 'shared', 'i18n', 'locales');

// 读取真正未使用的键列表
function readUnusedKeys() {
  const filePath = path.join(__dirname, 'truly_unused_keys.txt');
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 解析文件内容，提取键名
  const lines = content.split('\n');
  const keys = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过注释行和空行
    if (trimmed && !trimmed.startsWith('#')) {
      keys.push(trimmed);
    }
  }
  
  return keys;
}

// 从嵌套对象中删除键
function deleteNestedKey(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;
  
  // 导航到父对象
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      return false; // 键不存在
    }
    current = current[keys[i]];
  }
  
  // 删除最后一个键
  const lastKey = keys[keys.length - 1];
  if (current.hasOwnProperty(lastKey)) {
    delete current[lastKey];
    return true;
  }
  
  return false;
}

// 清理空的嵌套对象
function cleanEmptyObjects(obj) {
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      cleanEmptyObjects(obj[key]);
      // 如果对象为空，删除它
      if (Object.keys(obj[key]).length === 0) {
        delete obj[key];
      }
    }
  }
}

// 处理单个翻译文件
function processTranslationFile(filePath, unusedKeys) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const translations = JSON.parse(content);
    
    let removedCount = 0;
    const removedKeys = [];
    
    // 删除未使用的键
    for (const key of unusedKeys) {
      if (deleteNestedKey(translations, key)) {
        removedCount++;
        removedKeys.push(key);
      }
    }
    
    // 清理空的嵌套对象
    cleanEmptyObjects(translations);
    
    // 写回文件
    fs.writeFileSync(filePath, JSON.stringify(translations, null, 2) + '\n', 'utf8');
    
    return {
      file: path.basename(filePath),
      removedCount,
      removedKeys
    };
  } catch (error) {
    console.error(`处理文件 ${filePath} 时出错:`, error.message);
    return {
      file: path.basename(filePath),
      error: error.message,
      removedCount: 0,
      removedKeys: []
    };
  }
}

// 主函数
function main() {
  console.log('开始从所有语言文件中移除未使用的翻译键...');
  
  // 读取未使用的键列表
  const unusedKeys = readUnusedKeys();
  console.log(`找到 ${unusedKeys.length} 个真正未使用的键`);
  
  // 获取所有翻译文件
  const files = fs.readdirSync(localesDir).filter(file => file.endsWith('.json'));
  console.log(`找到 ${files.length} 个翻译文件`);
  
  const results = [];
  let totalRemovedKeys = 0;
  
  // 处理每个翻译文件
  for (const file of files) {
    const filePath = path.join(localesDir, file);
    const result = processTranslationFile(filePath, unusedKeys);
    results.push(result);
    totalRemovedKeys += result.removedCount;
    
    if (result.error) {
      console.log(`❌ ${result.file}: 处理失败 - ${result.error}`);
    } else {
      console.log(`✅ ${result.file}: 移除了 ${result.removedCount} 个键`);
    }
  }
  
  // 生成详细报告
  const report = {
    summary: {
      totalFiles: files.length,
      totalUnusedKeys: unusedKeys.length,
      totalRemovedKeys,
      timestamp: new Date().toLocaleString()
    },
    unusedKeys,
    results
  };
  
  // 保存报告
  const reportPath = path.join(__dirname, 'unused_keys_removal_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  
  console.log('\n=== 移除未使用键的总结 ===');
  console.log(`处理的文件数: ${files.length}`);
  console.log(`未使用的键数: ${unusedKeys.length}`);
  console.log(`总共移除的键数: ${totalRemovedKeys}`);
  console.log(`详细报告已保存到: ${reportPath}`);
  
  // 显示每个文件的详细结果
  console.log('\n=== 各文件处理结果 ===');
  for (const result of results) {
    if (result.error) {
      console.log(`${result.file}: ❌ 错误 - ${result.error}`);
    } else {
      console.log(`${result.file}: ✅ 移除 ${result.removedCount} 个键`);
    }
  }
  
  console.log('\n所有翻译文件处理完成！');
}

// 运行脚本
if (require.main === module) {
  main();
}

module.exports = {
  readUnusedKeys,
  deleteNestedKey,
  cleanEmptyObjects,
  processTranslationFile
};