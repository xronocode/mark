#!/usr/bin/env node

/**
 * 国际化文件命名空间对比脚本
 * 用于对比各个语言文件中命名空间和层级之间的数量差异
 * 帮助识别翻译文件中可能存在的不一致问题
 */

const fs = require('fs');
const path = require('path');

// 语言文件目录
const I18N_DIR = path.join(__dirname, '../src/shared/i18n/locales');

// 支持的语言列表
const LANGUAGES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'de', 'es', 'fr', 'pt'];

/**
 * 递归统计对象的键数量
 * @param {Object} obj - 要统计的对象
 * @param {string} prefix - 键的前缀路径
 * @returns {Object} 包含路径和数量的统计结果
 */
function countKeys(obj, prefix = '') {
  const result = {};
  let totalCount = 0;
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        // 递归处理嵌套对象
        const subResult = countKeys(obj[key], currentPath);
        Object.assign(result, subResult.paths);
        result[currentPath] = subResult.total;
        totalCount += subResult.total;
      } else {
        // 叶子节点
        totalCount += 1;
      }
    }
  }
  
  return {
    paths: result,
    total: totalCount
  };
}

/**
 * 加载并解析语言文件
 * @param {string} language - 语言代码
 * @returns {Object|null} 解析后的JSON对象
 */
function loadLanguageFile(language) {
  const filePath = path.join(I18N_DIR, `${language}.json`);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  语言文件不存在: ${filePath}`);
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ 加载语言文件失败 ${language}:`, error.message);
    return null;
  }
}

/**
 * 生成对比报告
 * @param {Object} languageStats - 各语言的统计数据
 */
function generateComparisonReport(languageStats) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 国际化文件命名空间数量对比报告');
  console.log('='.repeat(80));
  
  // 获取所有可能的路径
  const allPaths = new Set();
  Object.values(languageStats).forEach(stats => {
    if (stats) {
      Object.keys(stats.paths).forEach(path => allPaths.add(path));
      Object.keys(stats.namespaces).forEach(ns => allPaths.add(ns));
    }
  });
  
  const sortedPaths = Array.from(allPaths).sort();
  
  // 1. 总体统计
  console.log('\n📈 总体统计:');
  console.log('-'.repeat(60));
  console.log('语言\t\t总键数\t状态');
  console.log('-'.repeat(60));
  
  const baseLanguage = 'en';
  const baseTotal = languageStats[baseLanguage]?.total || 0;
  
  LANGUAGES.forEach(lang => {
    const stats = languageStats[lang];
    if (stats) {
      const diff = stats.total - baseTotal;
      const status = diff === 0 ? '✅ 一致' : 
                    diff > 0 ? `🔼 多${diff}个` : 
                    `🔽 少${Math.abs(diff)}个`;
      console.log(`${lang}\t\t${stats.total}\t${status}`);
    } else {
      console.log(`${lang}\t\t-\t❌ 文件缺失`);
    }
  });
  
  // 2. 命名空间级别对比
  console.log('\n🏷️  命名空间级别对比:');
  console.log('-'.repeat(80));
  
  // 获取所有命名空间
  const allNamespaces = new Set();
  Object.values(languageStats).forEach(stats => {
    if (stats) {
      Object.keys(stats.namespaces).forEach(ns => allNamespaces.add(ns));
    }
  });
  
  const sortedNamespaces = Array.from(allNamespaces).sort();
  
  // 打印表头
  const header = ['命名空间', ...LANGUAGES].join('\t');
  console.log(header);
  console.log('-'.repeat(80));
  
  sortedNamespaces.forEach(namespace => {
    const row = [namespace];
    
    LANGUAGES.forEach(lang => {
      const stats = languageStats[lang];
      if (stats && stats.namespaces[namespace] !== undefined) {
        row.push(stats.namespaces[namespace].toString());
      } else {
        row.push('-');
      }
    });
    
    console.log(row.join('\t'));
  });
  
  // 3. 详细路径对比（只显示有差异的）
  console.log('\n🔍 详细路径差异分析:');
  console.log('-'.repeat(80));
  
  const pathDifferences = [];
  
  sortedPaths.forEach(pathKey => {
    const counts = {};
    let hasVariation = false;
    
    LANGUAGES.forEach(lang => {
      const stats = languageStats[lang];
      if (stats) {
        const count = stats.paths[pathKey] || 0;
        counts[lang] = count;
        
        // 检查是否有变化
        const baseCount = counts[baseLanguage] || 0;
        if (count !== baseCount) {
          hasVariation = true;
        }
      }
    });
    
    if (hasVariation) {
      pathDifferences.push({ path: pathKey, counts });
    }
  });
  
  if (pathDifferences.length > 0) {
    console.log('\n发现以下路径存在数量差异:');
    pathDifferences.forEach(({ path, counts }) => {
      console.log(`\n📍 ${path}:`);
      LANGUAGES.forEach(lang => {
        if (counts[lang] !== undefined) {
          const baseCount = counts[baseLanguage] || 0;
          const diff = counts[lang] - baseCount;
          const status = diff === 0 ? '✅' : diff > 0 ? '🔼' : '🔽';
          console.log(`   ${lang}: ${counts[lang]} ${status}`);
        }
      });
    });
  } else {
    console.log('✅ 所有路径的键数量都保持一致!');
  }
  
  // 4. 缺失语言文件提醒
  const missingLanguages = LANGUAGES.filter(lang => !languageStats[lang]);
  if (missingLanguages.length > 0) {
    console.log('\n⚠️  缺失的语言文件:');
    missingLanguages.forEach(lang => {
      console.log(`   - ${lang}.json`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📋 报告生成完成');
  console.log('='.repeat(80));
}

/**
 * 主函数
 */
function main() {
  console.log('🚀 开始分析国际化文件...');
  
  const languageStats = {};
  
  // 加载并分析每个语言文件
  LANGUAGES.forEach(language => {
    console.log(`📖 正在分析 ${language}.json...`);
    
    const data = loadLanguageFile(language);
    if (data) {
      const result = countKeys(data);
      
      // 分析命名空间级别的统计
      const namespaces = {};
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          if (typeof data[key] === 'object' && data[key] !== null) {
            const nsResult = countKeys(data[key]);
            namespaces[key] = nsResult.total;
          } else {
            namespaces[key] = 1;
          }
        }
      }
      
      languageStats[language] = {
        total: result.total,
        paths: result.paths,
        namespaces: namespaces
      };
      
      console.log(`   ✅ ${language}: 总计 ${result.total} 个键`);
    }
  });
  
  // 生成对比报告
  generateComparisonReport(languageStats);
}

// 执行主函数
if (require.main === module) {
  main();
}

module.exports = {
  countKeys,
  loadLanguageFile,
  generateComparisonReport,
  main
};