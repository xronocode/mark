const fs = require('fs');
const path = require('path');

// 支持的语言列表
const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文', isBase: true },
  { code: 'zh-TW', name: '繁体中文' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'pt', name: 'Português' }
];

// 读取翻译文件
function readTranslationFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`读取文件失败: ${filePath}`, error.message);
    return null;
  }
}

// 写入翻译文件
function writeTranslationFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`写入文件失败: ${filePath}`, error.message);
    return false;
  }
}

// 获取所有键值对的扁平化表示
function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(flattened, flattenObject(obj[key], newKey));
      } else {
        flattened[newKey] = obj[key];
      }
    }
  }
  
  return flattened;
}

// 将扁平化对象还原为嵌套对象
function unflattenObject(flattened) {
  const result = {};
  
  for (const key in flattened) {
    const keys = key.split('.');
    let current = result;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = flattened[key];
  }
  
  return result;
}

// 通用修复函数
function fixCommonIssues(flattened, langCode, langName) {
  const fixes = [];
  
  for (const key in flattened) {
    const value = flattened[key];
    
    if (value && typeof value === 'string') {
      // 修复多余空格
      const trimmedValue = value.trim().replace(/\s+/g, ' ');
      if (trimmedValue !== value) {
        flattened[key] = trimmedValue;
        fixes.push({
          key,
          oldValue: value,
          newValue: trimmedValue,
          reason: '移除多余空格',
          langCode,
          langName
        });
      }
      
      // 移除TODO标记
      if (/\b(TODO|FIXME|TBD|待办|待翻译)\b/i.test(value)) {
        const cleanedValue = value.replace(/\b(TODO|FIXME|TBD|待办|待翻译)\s*:?\s*/gi, '').trim();
        if (cleanedValue !== value && cleanedValue.length > 0) {
          flattened[key] = cleanedValue;
          fixes.push({
            key,
            oldValue: value,
            newValue: cleanedValue,
            reason: '移除待办标记',
            langCode,
            langName
          });
        }
      }
    }
  }
  
  return fixes;
}

// 修复中文翻译中的明显英文错误
function fixChineseTranslations(zhFlattened, langCode, langName) {
  const fixes = [];
  const commonFixes = {
    'Error switching spellcheck language': '切换拼写检查语言时出错',
    'Error exporting file': '导出文件时出错',
    'Error importing file': '导入文件时出错',
    'Error loading file': '加载文件时出错',
    'Error saving file': '保存文件时出错',
    'Error creating file': '创建文件时出错',
    'Error deleting file': '删除文件时出错',
    'Error copying file': '复制文件时出错',
    'Error moving file': '移动文件时出错',
    'Error renaming file': '重命名文件时出错',
    'File not found': '文件未找到',
    'Invalid file format': '无效的文件格式',
    'Permission denied': '权限被拒绝',
    'Network error': '网络错误',
    'Connection timeout': '连接超时',
    'Unknown error': '未知错误',
    'Copy': '复制',
    'Paste': '粘贴',
    'Cut': '剪切',
    'Undo': '撤销',
    'Redo': '重做',
    'Save': '保存',
    'Open': '打开',
    'Close': '关闭',
    'Exit': '退出',
    'Help': '帮助',
    'About': '关于',
    'Settings': '设置',
    'Preferences': '偏好设置'
  };
  
  // 先执行通用修复
  const commonFixes_result = fixCommonIssues(zhFlattened, langCode, langName);
  fixes.push(...commonFixes_result);
  
  for (const key in zhFlattened) {
    const value = zhFlattened[key];
    
    if (value && typeof value === 'string') {
      // 检查是否是明显的英文错误
      if (commonFixes[value]) {
        zhFlattened[key] = commonFixes[value];
        fixes.push({
          key,
          oldValue: value,
          newValue: commonFixes[value],
          reason: '修复中文翻译中的英文错误',
          langCode,
          langName
        });
      }
      
      // 修复省略号格式
      if (value.includes('...')) {
        const fixedValue = value.replace(/\.{3,}/g, '…');
        if (fixedValue !== value) {
          zhFlattened[key] = fixedValue;
          fixes.push({
            key,
            oldValue: value,
            newValue: fixedValue,
            reason: '统一省略号格式',
            langCode,
            langName
          });
        }
      }
    }
  }
  
  return fixes;
}

// 修复英文翻译中的问题
function fixEnglishTranslations(enFlattened, langCode, langName) {
  const fixes = [];
  
  // 先执行通用修复
  const commonFixes_result = fixCommonIssues(enFlattened, langCode, langName);
  fixes.push(...commonFixes_result);
  
  for (const key in enFlattened) {
    const value = enFlattened[key];
    
    if (value && typeof value === 'string') {
      // 修复标点符号不一致（如省略号后的句号）
      if (value.includes('...')) {
        let fixedValue = value.replace(/\.{4,}/g, '...');
        if (fixedValue !== value) {
          enFlattened[key] = fixedValue;
          fixes.push({
            key,
            oldValue: value,
            newValue: fixedValue,
            reason: '统一省略号格式',
            langCode,
            langName
          });
        }
      }
      
      // 移除英文翻译中的中文字符（除了专有名词）
      if (/[\u4e00-\u9fff]/.test(value)) {
        // 检查是否是语言名称等合理情况
        const isLanguageName = /^(简体中文|繁體中文|日本語|한국어|中文|中国|中國)$/i.test(value);
        if (!isLanguageName) {
          // 尝试移除中文字符（这里只是标记，实际可能需要人工处理）
          console.warn(`⚠️  发现英文翻译包含中文字符: ${key} = "${value}"`);
        }
      }
    }
  }
  
  return fixes;
}

// 修复其他语言翻译中的问题
function fixOtherLanguageTranslations(flattened, langCode, langName) {
  const fixes = [];
  
  // 先执行通用修复
  const commonFixes_result = fixCommonIssues(flattened, langCode, langName);
  fixes.push(...commonFixes_result);
  
  for (const key in flattened) {
    const value = flattened[key];
    
    if (value && typeof value === 'string') {
      // 移除其他语言翻译中的中文字符（除了专有名词）
      if (/[\u4e00-\u9fff]/.test(value)) {
        // 检查是否是语言名称等合理情况
        const isLanguageName = /^(简体中文|繁體中文|日本語|한국어|中文|中国|中國)$/i.test(value);
        if (!isLanguageName) {
          console.warn(`⚠️  发现${langName}翻译包含中文字符: ${key} = "${value}"`);
        }
      }
      
      // 检查是否完全是英文（可能未翻译）
      if (/^[a-zA-Z\s\-_.,;:!?()\[\]{}"'0-9]+$/.test(value) && value.length > 10) {
        // 排除专有名词
        const isProperNoun = /^(MarkText|GitHub|Markdown|HTML|CSS|JavaScript|JSON|XML|PDF|PNG|JPG|JPEG|GIF|SVG|URL|HTTP|HTTPS|API|UI|UX|ID|OK|Cancel|Error|Warning|Info|Debug|Electron|Node\.js|npm|yarn|Git|macOS|Windows|Linux|Ubuntu|Debian|CentOS|Chrome|Firefox|Safari|Edge|Opera)$/i.test(value);
        if (!isProperNoun) {
          console.warn(`⚠️  发现${langName}翻译可能未本地化: ${key} = "${value}"`);
        }
      }
    }
  }
  
  return fixes;
}

// 多语言自动修复翻译问题
function fixMultiLanguageTranslationIssues() {
  const localesDir = path.join(__dirname, '../src/shared/i18n/locales');
  
  console.log('🔧 开始多语言自动修复翻译问题...');
  console.log(`翻译文件目录: ${localesDir}`);
  
  // 读取所有语言文件
  const languageData = {};
  
  for (const lang of SUPPORTED_LANGUAGES) {
    const filePath = path.join(localesDir, `${lang.code}.json`);
    console.log(`📖 读取 ${lang.name} (${lang.code}): ${filePath}`);
    
    const data = readTranslationFile(filePath);
    if (data) {
      languageData[lang.code] = {
        raw: data,
        flattened: flattenObject(data),
        name: lang.name,
        filePath: filePath
      };
    } else {
      console.error(`❌ 无法读取 ${lang.name} 翻译文件`);
    }
  }
  
  console.log('\n📊 开始修复...');
  
  let allFixes = [];
  let successfulWrites = 0;
  
  // 修复每种语言
  for (const [code, data] of Object.entries(languageData)) {
    console.log(`\n🔧 修复 ${data.name} (${code})...`);
    
    let fixes = [];
    
    if (code.startsWith('zh')) {
      // 中文语言特殊处理
      fixes = fixChineseTranslations(data.flattened, code, data.name);
    } else if (code === 'en') {
      // 英文特殊处理
      fixes = fixEnglishTranslations(data.flattened, code, data.name);
    } else {
      // 其他语言
      fixes = fixOtherLanguageTranslations(data.flattened, code, data.name);
    }
    
    console.log(`  修复 ${fixes.length} 项问题`);
    
    if (fixes.length > 0) {
      // 显示修复详情（限制显示数量）
      const displayCount = Math.min(fixes.length, 5);
      fixes.slice(0, displayCount).forEach(fix => {
        console.log(`    ${fix.key}: "${fix.oldValue}" → "${fix.newValue}" (${fix.reason})`);
      });
      if (fixes.length > displayCount) {
        console.log(`    ... 还有 ${fixes.length - displayCount} 项修复`);
      }
      
      // 还原为嵌套对象并写回文件
      const fixedData = unflattenObject(data.flattened);
      const writeSuccess = writeTranslationFile(data.filePath, fixedData);
      
      if (writeSuccess) {
        successfulWrites++;
        console.log(`  ✅ ${data.name} 修复完成并保存`);
      } else {
        console.error(`  ❌ ${data.name} 保存失败`);
      }
    } else {
      console.log(`  ✅ ${data.name} 无需修复`);
    }
    
    allFixes.push(...fixes);
  }
  
  const totalFixes = allFixes.length;
  
  console.log(`\n📋 修复总结:`);
  console.log(`总计修复: ${totalFixes} 项问题`);
  console.log(`成功保存: ${successfulWrites} 个文件`);
  
  // 按语言统计修复数量
  const fixesByLanguage = {};
  allFixes.forEach(fix => {
    if (!fixesByLanguage[fix.langCode]) {
      fixesByLanguage[fix.langCode] = {
        name: fix.langName,
        count: 0,
        fixes: []
      };
    }
    fixesByLanguage[fix.langCode].count++;
    fixesByLanguage[fix.langCode].fixes.push(fix);
  });
  
  console.log('\n📊 各语言修复统计:');
  for (const [code, stats] of Object.entries(fixesByLanguage)) {
    console.log(`  ${stats.name} (${code}): ${stats.count} 项`);
  }
  
  if (totalFixes === 0) {
    console.log('\n✅ 未发现需要修复的问题');
    return;
  }
  
  // 生成修复报告
  const report = {
    summary: {
      totalFixes,
      totalLanguages: Object.keys(languageData).length,
      successfulWrites,
      fixTime: new Date().toISOString()
    },
    fixesByLanguage,
    allFixes
  };
  
  const reportPath = path.join(__dirname, 'multilingual_fix_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📋 修复报告已保存到: ${reportPath}`);
  
  if (totalFixes > 0) {
    console.log(`\n✅ 多语言修复完成！总计修复 ${totalFixes} 项问题`);
  }
}

// 运行修复
fixMultiLanguageTranslationIssues();