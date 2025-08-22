const fs = require('fs');
const path = require('path');

// 翻译文件目录
const localesDir = path.join(__dirname, 'src/shared/i18n/locales');

// 读取比对报告
const reportPath = path.join(__dirname, 'translation_comparison_report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

console.log('开始修复翻译文件...');

// 加载英文基准文件
const enFilePath = path.join(localesDir, 'en.json');
const enData = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));

// 递归获取嵌套对象的值
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

// 递归设置嵌套对象的值
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  
  let current = obj;
  for (const key of keys) {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[lastKey] = value;
}

// 递归删除嵌套对象的键
function deleteNestedKey(obj, path) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  
  let current = obj;
  for (const key of keys) {
    if (!current[key]) {
      return false; // 路径不存在
    }
    current = current[key];
  }
  
  if (current[lastKey] !== undefined) {
    delete current[lastKey];
    return true;
  }
  return false;
}

// 清理空对象
function cleanEmptyObjects(obj) {
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      cleanEmptyObjects(obj[key]);
      if (Object.keys(obj[key]).length === 0) {
        delete obj[key];
      }
    }
  }
}

// 修复每个语言文件
for (const [language, summary] of Object.entries(report.summary)) {
  console.log(`\n修复 ${language}.json...`);
  
  const filePath = path.join(localesDir, `${language}.json`);
  let data;
  
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`读取 ${language}.json 失败:`, error.message);
    continue;
  }
  
  let modified = false;
  
  // 添加缺失的键
  const missingKeys = report.missingKeys[language] || [];
  if (missingKeys.length > 0) {
    console.log(`  添加 ${missingKeys.length} 个缺失的键:`);
    
    for (const keyPath of missingKeys) {
      const enValue = getNestedValue(enData, keyPath);
      if (enValue !== undefined) {
        setNestedValue(data, keyPath, enValue);
        console.log(`    + ${keyPath}`);
        modified = true;
      } else {
        console.log(`    ! 警告: 在英文文件中找不到键 ${keyPath}`);
      }
    }
  }
  
  // 删除多余的键
  const extraKeys = report.extraKeys[language] || [];
  if (extraKeys.length > 0) {
    console.log(`  删除 ${extraKeys.length} 个多余的键:`);
    
    for (const keyPath of extraKeys) {
      if (deleteNestedKey(data, keyPath)) {
        console.log(`    - ${keyPath}`);
        modified = true;
      } else {
        console.log(`    ! 警告: 找不到要删除的键 ${keyPath}`);
      }
    }
    
    // 清理空对象
    cleanEmptyObjects(data);
  }
  
  // 保存修改后的文件
  if (modified) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      console.log(`  ✅ ${language}.json 修复完成`);
    } catch (error) {
      console.error(`  ❌ 保存 ${language}.json 失败:`, error.message);
    }
  } else {
    console.log(`  ℹ️  ${language}.json 无需修改`);
  }
}

console.log('\n修复完成！');
console.log('\n建议运行以下命令验证修复结果:');
console.log('node compare_translations.js');