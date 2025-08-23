const fs = require('fs');
const path = require('path');

// 配置路径
const EN_FILE_PATH = path.join(__dirname, '../src/shared/i18n/locales/en.json');
const PROJECT_ROOT = path.join(__dirname, '../');
const SEARCH_DIRS = [
  'src/main',
  'src/renderer',
  'src/common',
  'src/preload'
];

/**
 * 递归获取对象的所有键路径
 * @param {Object} obj - 要遍历的对象
 * @param {string} prefix - 键路径前缀
 * @returns {Array} 所有键路径的数组
 */
function getAllKeys(obj, prefix = '') {
  const keys = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 递归处理嵌套对象
      keys.push(...getAllKeys(value, fullKey));
    } else {
      // 叶子节点，添加完整键路径
      keys.push(fullKey);
    }
  }
  
  return keys;
}

/**
 * 递归读取目录中的所有文件
 * @param {string} dir - 目录路径
 * @param {Array} extensions - 要包含的文件扩展名
 * @returns {Array} 文件路径数组
 */
function getAllFiles(dir, extensions = ['.js', '.ts', '.vue', '.json']) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // 跳过某些目录
        if (!['node_modules', '.git', 'dist', 'build', 'temp'].includes(item)) {
          files.push(...getAllFiles(fullPath, extensions));
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.warn(`无法读取目录 ${dir}:`, error.message);
  }
  
  return files;
}

/**
 * 在文件内容中搜索键的使用情况
 * @param {string} key - 要搜索的键
 * @param {Array} files - 要搜索的文件列表
 * @returns {Object} 搜索结果
 */
function searchKeyInFiles(key, files) {
  const results = {
    key: key,
    found: false,
    matches: []
  };
  
  // 生成搜索模式
  const searchPatterns = [
    `"${key}"`,
    `'${key}'`,
    `\`${key}\``,
    `t("${key}")`,
    `t('${key}')`,
    `$t("${key}")`,
    `$t('${key}')`,
    `i18n.t("${key}")`,
    `i18n.t('${key}')`
  ];
  
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      for (const pattern of searchPatterns) {
        if (content.includes(pattern)) {
          results.found = true;
          
          // 找到匹配的行号
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(pattern)) {
              results.matches.push({
                file: path.relative(PROJECT_ROOT, filePath),
                line: i + 1,
                content: lines[i].trim(),
                pattern: pattern
              });
            }
          }
        }
      }
    } catch (error) {
      // 忽略读取文件错误
    }
  }
  
  return results;
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 开始分析英文翻译文件中的键使用情况...');
  console.log('=' .repeat(60));
  
  try {
    // 读取英文翻译文件
    const enContent = fs.readFileSync(EN_FILE_PATH, 'utf8');
    const enData = JSON.parse(enContent);
    
    // 获取所有键
    const allKeys = getAllKeys(enData);
    console.log(`📊 英文翻译文件中共有 ${allKeys.length} 个键`);
    
    // 获取所有要搜索的文件
    console.log('📁 正在扫描项目文件...');
    const allFiles = [];
    for (const searchDir of SEARCH_DIRS) {
      const dirPath = path.join(PROJECT_ROOT, searchDir);
      if (fs.existsSync(dirPath)) {
        allFiles.push(...getAllFiles(dirPath));
      }
    }
    console.log(`📄 找到 ${allFiles.length} 个文件需要搜索`);
    console.log('');
    
    // 分析结果
    const usedKeys = [];
    const unusedKeys = [];
    const searchResults = [];
    
    console.log('🔍 开始搜索键的使用情况...');
    
    // 分批处理，显示进度
    const batchSize = 50;
    for (let i = 0; i < allKeys.length; i += batchSize) {
      const batch = allKeys.slice(i, i + batchSize);
      const progress = ((i / allKeys.length) * 100).toFixed(1);
      console.log(`处理进度: ${progress}% (${i + 1}-${Math.min(i + batchSize, allKeys.length)}/${allKeys.length})`);
      
      for (const key of batch) {
        const result = searchKeyInFiles(key, allFiles);
        searchResults.push(result);
        
        if (result.found) {
          usedKeys.push(key);
        } else {
          unusedKeys.push(key);
        }
      }
    }
    
    console.log('');
    console.log('📈 分析结果统计:');
    console.log('=' .repeat(60));
    console.log(`✅ 已使用的键: ${usedKeys.length} 个`);
    console.log(`❌ 未使用的键: ${unusedKeys.length} 个`);
    console.log(`📊 使用率: ${((usedKeys.length / allKeys.length) * 100).toFixed(2)}%`);
    console.log('');
    
    // 显示未使用的键
    if (unusedKeys.length > 0) {
      console.log('❌ 未使用的翻译键:');
      console.log('-' .repeat(40));
      
      // 按命名空间分组显示
      const unusedByNamespace = {};
      unusedKeys.forEach(key => {
        const namespace = key.split('.')[0];
        if (!unusedByNamespace[namespace]) {
          unusedByNamespace[namespace] = [];
        }
        unusedByNamespace[namespace].push(key);
      });
      
      Object.entries(unusedByNamespace).forEach(([namespace, keys]) => {
        console.log(`\n📁 ${namespace} 命名空间 (${keys.length} 个未使用):`);
        keys.slice(0, 10).forEach(key => {
          console.log(`  - ${key}`);
        });
        if (keys.length > 10) {
          console.log(`  ... 还有 ${keys.length - 10} 个`);
        }
      });
    }
    
    // 显示部分已使用的键示例
    if (usedKeys.length > 0) {
      console.log('\n✅ 已使用的翻译键示例 (前5个):');
      console.log('-' .repeat(40));
      usedKeys.slice(0, 5).forEach(key => {
        const result = searchResults.find(r => r.key === key);
        console.log(`  ✓ ${key}`);
        if (result && result.matches.length > 0) {
          const firstMatch = result.matches[0];
          console.log(`    └─ ${firstMatch.file}:${firstMatch.line}`);
        }
      });
    }
    
    // 生成详细报告文件
    const reportPath = path.join(__dirname, 'translation_usage_report.json');
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalKeys: allKeys.length,
        usedKeys: usedKeys.length,
        unusedKeys: unusedKeys.length,
        usageRate: ((usedKeys.length / allKeys.length) * 100).toFixed(2) + '%'
      },
      unusedKeys: unusedKeys,
      usedKeys: usedKeys.slice(0, 100), // 只保存前100个已使用的键
      detailedResults: searchResults.filter(r => !r.found) // 只保存未使用键的详细结果
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n📄 详细报告已保存到: ${reportPath}`);
    
    // 生成简化的未使用键列表
    const unusedKeysPath = path.join(__dirname, 'unused_translation_keys.txt');
    const unusedKeysContent = [
      '# 未使用的翻译键列表',
      `# 生成时间: ${new Date().toLocaleString()}`,
      `# 总键数: ${allKeys.length}`,
      `# 未使用键数: ${unusedKeys.length}`,
      `# 使用率: ${((usedKeys.length / allKeys.length) * 100).toFixed(2)}%`,
      '',
      ...unusedKeys
    ].join('\n');
    
    fs.writeFileSync(unusedKeysPath, unusedKeysContent, 'utf8');
    console.log(`📄 未使用键列表已保存到: ${unusedKeysPath}`);
    
    console.log('');
    console.log('✨ 分析完成!');
    
  } catch (error) {
    console.error('❌ 分析过程中出错:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = {
  getAllKeys,
  searchKeyInFiles,
  main
};