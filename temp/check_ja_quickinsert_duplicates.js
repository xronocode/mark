const fs = require('fs');
const path = require('path');

// 读取日语翻译文件
const jaFilePath = path.join(__dirname, '../src/shared/i18n/locales/ja.json');
const jaContent = JSON.parse(fs.readFileSync(jaFilePath, 'utf8'));

// 检查quickInsert命名空间中的重复键
function checkDuplicateKeys(obj, currentPath = '', allKeys = new Set(), duplicates = new Set()) {
  for (const key in obj) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    
    if (allKeys.has(fullPath)) {
      duplicates.add(fullPath);
      console.log(`🔴 发现重复键: ${fullPath}`);
    } else {
      allKeys.add(fullPath);
    }
    
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      checkDuplicateKeys(obj[key], fullPath, allKeys, duplicates);
    }
  }
  
  return duplicates;
}

// 专门检查quickInsert命名空间
function checkQuickInsertDuplicates() {
  console.log('🔍 检查日语翻译文件中quickInsert命名空间的重复键...');
  console.log('================================================================================');
  
  if (!jaContent.quickInsert) {
    console.log('❌ 未找到quickInsert命名空间');
    return;
  }
  
  const duplicates = checkDuplicateKeys(jaContent.quickInsert, 'quickInsert');
  
  console.log('================================================================================');
  
  if (duplicates.size === 0) {
    console.log('✅ 未发现重复键');
  } else {
    console.log(`❌ 发现 ${duplicates.size} 个重复键:`);
    duplicates.forEach(key => {
      console.log(`   - ${key}`);
    });
  }
  
  // 额外检查：查找可能的命名冲突
  console.log('\n🔍 检查可能的命名冲突...');
  const quickInsertKeys = Object.keys(jaContent.quickInsert);
  const potentialConflicts = [];
  
  for (let i = 0; i < quickInsertKeys.length; i++) {
    for (let j = i + 1; j < quickInsertKeys.length; j++) {
      const key1 = quickInsertKeys[i];
      const key2 = quickInsertKeys[j];
      
      // 检查相似的键名
      if (key1.toLowerCase().includes(key2.toLowerCase()) || 
          key2.toLowerCase().includes(key1.toLowerCase())) {
        potentialConflicts.push([key1, key2]);
      }
    }
  }
  
  if (potentialConflicts.length > 0) {
    console.log('⚠️  发现可能的命名冲突:');
    potentialConflicts.forEach(([key1, key2]) => {
      console.log(`   - "${key1}" 和 "${key2}"`);
    });
  } else {
    console.log('✅ 未发现命名冲突');
  }
  
  // 显示quickInsert的结构概览
  console.log('\n📋 quickInsert命名空间结构概览:');
  console.log('================================================================================');
  
  function printStructure(obj, indent = '') {
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        console.log(`${indent}📁 ${key}`);
        printStructure(obj[key], indent + '  ');
      } else {
        console.log(`${indent}📄 ${key}: "${obj[key]}"`);
      }
    }
  }
  
  printStructure(jaContent.quickInsert);
}

// 执行检查
checkQuickInsertDuplicates();

console.log('\n📋 检查完成');
console.log('================================================================================');