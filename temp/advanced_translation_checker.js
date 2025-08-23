#!/usr/bin/env node

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

// 检查可疑翻译（翻译与基准语言相同）
function findSuspiciousTranslations(baseFlattened, targetFlattened, baseLang, targetLang) {
  const suspicious = [];
  
  for (const key in baseFlattened) {
    const baseValue = baseFlattened[key];
    const targetValue = targetFlattened[key];
    
    if (baseValue && targetValue && baseValue === targetValue) {
      // 排除一些合理的情况（如数字、符号、专有名词等）
      if (!/^[0-9\s\-_.,;:!?()\[\]{}"']+$/.test(baseValue) && 
          !/^(MarkText|GitHub|Markdown|HTML|CSS|JavaScript|JSON|XML|PDF|PNG|JPG|JPEG|GIF|SVG|URL|HTTP|HTTPS|API|UI|UX|ID|OK|Cancel)$/i.test(baseValue)) {
        suspicious.push({
          key,
          value: baseValue,
          baseLang,
          targetLang,
          reason: `${targetLang}翻译与${baseLang}相同`
        });
      }
    }
  }
  
  return suspicious;
}

// 检查格式问题（占位符、HTML标签等）
function checkFormatIssues(baseFlattened, targetFlattened, baseLang, targetLang) {
  const issues = [];
  
  for (const key in baseFlattened) {
    const baseValue = baseFlattened[key];
    const targetValue = targetFlattened[key];
    
    if (baseValue && targetValue) {
      // 检查占位符数量是否一致
      const basePlaceholders = (baseValue.match(/\{[^}]*\}/g) || []).length;
      const targetPlaceholders = (targetValue.match(/\{[^}]*\}/g) || []).length;
      
      if (basePlaceholders !== targetPlaceholders) {
        issues.push({
          key,
          baseValue,
          targetValue,
          baseLang,
          targetLang,
          issue: `占位符数量不一致 (${baseLang}:${basePlaceholders}, ${targetLang}:${targetPlaceholders})`
        });
      }
      
      // 检查HTML标签是否一致
      const baseTags = (baseValue.match(/<[^>]*>/g) || []).sort();
      const targetTags = (targetValue.match(/<[^>]*>/g) || []).sort();
      
      if (JSON.stringify(baseTags) !== JSON.stringify(targetTags)) {
        issues.push({
          key,
          baseValue,
          targetValue,
          baseLang,
          targetLang,
          issue: 'HTML标签不一致'
        });
      }
    }
  }
  
  return issues;
}

// 检查特定语言的常见错误
function checkLanguageSpecificErrors(flattened, langCode, langName) {
  const errors = [];
  
  for (const key in flattened) {
    const value = flattened[key];
    
    if (!value) continue;
    
    // 通用检查
    // 检查是否包含TODO标记
    if (/todo|TODO|待办|待翻译|FIXME|TBD/i.test(value)) {
      errors.push({
        key,
        value,
        langCode,
        langName,
        issue: '包含待办标记'
      });
    }
    
    // 检查多余空格
    if (value !== value.trim() || /\s{2,}/.test(value)) {
      errors.push({
        key,
        value,
        langCode,
        langName,
        issue: '包含多余空格'
      });
    }
    
    // 中文特定检查
    if (langCode.startsWith('zh')) {
      // 检查中文翻译中是否包含英文错误（排除专有名词）
      if (/^[a-zA-Z\s\-_.,;:!?()\[\]{}"'0-9]+$/.test(value) && value.length > 3 &&
          !/^(MarkText|GitHub|Markdown|HTML|CSS|JavaScript|JSON|XML|PDF|PNG|JPG|JPEG|GIF|SVG|URL|HTTP|HTTPS|API|UI|UX|ID|OK|Cancel|Error|Warning|Info|Debug|Electron|Node\.js|npm|yarn|Git|macOS|Windows|Linux|Ubuntu|Debian|CentOS|Chrome|Firefox|Safari|Edge|Opera)$/i.test(value)) {
        errors.push({
          key,
          value,
          langCode,
          langName,
          issue: '中文翻译可能是英文'
        });
      }
    }
    
    // 英文特定检查
    if (langCode === 'en') {
      // 检查英文翻译中是否包含中文字符
      if (/[\u4e00-\u9fff]/.test(value)) {
        errors.push({
          key,
          value,
          langCode,
          langName,
          issue: '英文翻译包含中文字符'
        });
      }
    }
    
    // 其他语言特定检查
    if (!langCode.startsWith('zh') && langCode !== 'en') {
      // 检查是否包含中文字符（除了中文语言）
      if (/[\u4e00-\u9fff]/.test(value)) {
        errors.push({
          key,
          value,
          langCode,
          langName,
          issue: `${langName}翻译包含中文字符`
        });
      }
      
      // 检查是否完全是英文（可能未翻译）
      if (/^[a-zA-Z\s\-_.,;:!?()\[\]{}"'0-9]+$/.test(value) && value.length > 10 &&
          !/^(MarkText|GitHub|Markdown|HTML|CSS|JavaScript|JSON|XML|PDF|PNG|JPG|JPEG|GIF|SVG|URL|HTTP|HTTPS|API|UI|UX|ID|OK|Cancel|Error|Warning|Info|Debug|Electron|Node\.js|npm|yarn|Git|macOS|Windows|Linux|Ubuntu|Debian|CentOS|Chrome|Firefox|Safari|Edge|Opera)$/i.test(value)) {
        errors.push({
          key,
          value,
          langCode,
          langName,
          issue: `${langName}翻译可能未本地化（仍为英文）`
        });
      }
    }
  }
  
  return errors;
}

// 检查标点符号一致性
function checkPunctuationConsistency(baseFlattened, targetFlattened, baseLang, targetLang) {
  const issues = [];
  
  for (const key in baseFlattened) {
    const baseValue = baseFlattened[key];
    const targetValue = targetFlattened[key];
    
    if (baseValue && targetValue) {
      // 检查省略号
      const baseHasEllipsis = /\.{3,}|…/.test(baseValue);
      const targetHasEllipsis = /\.{3,}|…/.test(targetValue);
      
      if (baseHasEllipsis !== targetHasEllipsis) {
        issues.push({
          key,
          baseValue,
          targetValue,
          baseLang,
          targetLang,
          issue: '省略号使用不一致'
        });
      }
      
      // 检查冒号
      const baseHasColon = /:/.test(baseValue);
      const targetHasColon = /:/.test(targetValue);
      
      if (baseHasColon !== targetHasColon) {
        issues.push({
          key,
          baseValue,
          targetValue,
          baseLang,
          targetLang,
          issue: '冒号使用不一致'
        });
      }
    }
  }
  
  return issues;
}

// 多语言高级翻译质量检查
function advancedMultiLanguageCheck() {
  const localesDir = path.join(__dirname, '../src/shared/i18n/locales');
  
  console.log('🔍 开始多语言高级翻译质量检查...');
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
        isBase: lang.isBase || false
      };
    } else {
      console.error(`❌ 无法读取 ${lang.name} 翻译文件`);
    }
  }
  
  const baseLanguage = 'zh-CN';
  const baseData = languageData[baseLanguage];
  
  if (!baseData) {
    console.error('❌ 无法读取基准语言文件 (简体中文)');
    return;
  }
  
  console.log('\n📊 基本统计:');
  for (const [code, data] of Object.entries(languageData)) {
    console.log(`${data.name} (${code}): ${Object.keys(data.flattened).length} 个键值`);
  }
  
  console.log('\n🔍 执行质量检查...');
  
  let allSuspiciousTranslations = [];
  let allFormatIssues = [];
  let allCommonErrors = [];
  let allPunctuationIssues = [];
  
  // 检查每种语言
  for (const [code, data] of Object.entries(languageData)) {
    if (code === baseLanguage) {
      // 检查基准语言自身的错误
      const errors = checkLanguageSpecificErrors(data.flattened, code, data.name);
      allCommonErrors.push(...errors);
    } else {
      // 与基准语言比较
      const suspicious = findSuspiciousTranslations(baseData.flattened, data.flattened, baseData.name, data.name);
      const formatIssues = checkFormatIssues(baseData.flattened, data.flattened, baseData.name, data.name);
      const punctuationIssues = checkPunctuationConsistency(baseData.flattened, data.flattened, baseData.name, data.name);
      const errors = checkLanguageSpecificErrors(data.flattened, code, data.name);
      
      allSuspiciousTranslations.push(...suspicious);
      allFormatIssues.push(...formatIssues);
      allPunctuationIssues.push(...punctuationIssues);
      allCommonErrors.push(...errors);
    }
  }
  
  const totalIssues = allSuspiciousTranslations.length + allFormatIssues.length + 
                     allCommonErrors.length + allPunctuationIssues.length;
  
  console.log(`\n📋 检查结果:`);
  console.log(`可疑翻译: ${allSuspiciousTranslations.length} 个`);
  console.log(`格式问题: ${allFormatIssues.length} 个`);
  console.log(`标点符号问题: ${allPunctuationIssues.length} 个`);
  console.log(`常见错误: ${allCommonErrors.length} 个`);
  console.log(`总计问题: ${totalIssues} 个`);
  
  // 显示详细结果
  if (allSuspiciousTranslations.length > 0) {
    console.log('\n⚠️  可疑翻译:');
    allSuspiciousTranslations.slice(0, 15).forEach(item => {
      console.log(`  ${item.key} (${item.targetLang}): "${item.value}" - ${item.reason}`);
    });
    if (allSuspiciousTranslations.length > 15) {
      console.log(`  ... 还有 ${allSuspiciousTranslations.length - 15} 个`);
    }
  }
  
  if (allFormatIssues.length > 0) {
    console.log('\n❌ 格式问题:');
    allFormatIssues.forEach(item => {
      console.log(`  ${item.key} (${item.targetLang}): ${item.issue}`);
      console.log(`    ${item.baseLang}: "${item.baseValue}"`);
      console.log(`    ${item.targetLang}: "${item.targetValue}"`);
    });
  }
  
  if (allPunctuationIssues.length > 0) {
    console.log('\n⚠️  标点符号问题:');
    allPunctuationIssues.slice(0, 10).forEach(item => {
      console.log(`  ${item.key} (${item.targetLang}): ${item.issue}`);
    });
    if (allPunctuationIssues.length > 10) {
      console.log(`  ... 还有 ${allPunctuationIssues.length - 10} 个`);
    }
  }
  
  if (allCommonErrors.length > 0) {
    console.log('\n🚨 常见错误:');
    allCommonErrors.slice(0, 20).forEach(item => {
      console.log(`  ${item.key} (${item.langName}): "${item.value}" - ${item.issue}`);
    });
    if (allCommonErrors.length > 20) {
      console.log(`  ... 还有 ${allCommonErrors.length - 20} 个`);
    }
  }
  
  // 生成详细报告
  const report = {
    summary: {
      baseLanguage: baseLanguage,
      totalLanguages: Object.keys(languageData).length,
      suspiciousCount: allSuspiciousTranslations.length,
      formatIssuesCount: allFormatIssues.length,
      punctuationIssuesCount: allPunctuationIssues.length,
      commonErrorsCount: allCommonErrors.length,
      totalIssues,
      checkTime: new Date().toISOString()
    },
    languageStats: Object.fromEntries(
      Object.entries(languageData).map(([code, data]) => [
        code,
        {
          name: data.name,
          keyCount: Object.keys(data.flattened).length
        }
      ])
    ),
    details: {
      suspiciousTranslations: allSuspiciousTranslations,
      formatIssues: allFormatIssues,
      punctuationIssues: allPunctuationIssues,
      commonErrors: allCommonErrors
    }
  };
  
  const reportPath = path.join(__dirname, 'advanced_multilingual_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📄 详细报告已保存到: ${reportPath}`);
  
  if (totalIssues === 0) {
    console.log('\n✅ 多语言翻译质量检查完成，未发现问题！');
  } else {
    console.log(`\n⚠️  发现 ${totalIssues} 个潜在问题，请查看详细报告`);
  }
  
  return report;
}

// 运行检查
advancedMultiLanguageCheck();