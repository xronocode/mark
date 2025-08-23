const fs = require('fs');
const path = require('path');

// 配置路径
const PROJECT_ROOT = path.join(__dirname, '../');
const UNUSED_KEYS_FILE = path.join(__dirname, 'unused_translation_keys.txt');
const SEARCH_DIRS = [
  'src/main',
  'src/renderer',
  'src/common',
  'src/preload'
];

/**
 * 递归读取目录中的所有文件
 */
function getAllFiles(dir, extensions = ['.js', '.ts', '.vue', '.json']) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
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
 * 深度搜索键的使用情况，包括动态构建的键名
 */
function deepSearchKey(key, files) {
  const results = {
    key: key,
    found: false,
    matches: [],
    dynamicMatches: []
  };
  
  // 分解键名
  const keyParts = key.split('.');
  const namespace = keyParts[0];
  const subKeys = keyParts.slice(1);
  
  // 生成各种搜索模式
  const searchPatterns = [
    // 完整键名
    `"${key}"`,
    `'${key}'`,
    `\`${key}\``,
    // 翻译函数调用
    `t("${key}")`,
    `t('${key}')`,
    `$t("${key}")`,
    `$t('${key}')`,
    `i18n.t("${key}")`,
    `i18n.t('${key}')`,
    // 键名的各个部分
    ...keyParts.map(part => `"${part}"`),
    ...keyParts.map(part => `'${part}'`),
    // 命名空间相关
    `"${namespace}"`,
    `'${namespace}'`
  ];
  
  // 动态构建模式
  const dynamicPatterns = [
    // 模板字符串
    `\`\${.*}${keyParts[keyParts.length - 1]}\``,
    `\`${namespace}\${.*}\``,
    // 字符串拼接
    `+ "${keyParts[keyParts.length - 1]}"`,
    `+ '${keyParts[keyParts.length - 1]}'`,
    `"${namespace}." +`,
    `'${namespace}.' +`,
    // 对象属性访问
    `["${keyParts[keyParts.length - 1]}"]`,
    `['${keyParts[keyParts.length - 1]}']`
  ];
  
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // 搜索完整模式
      for (const pattern of searchPatterns) {
        if (content.includes(pattern)) {
          results.found = true;
          
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(pattern)) {
              results.matches.push({
                file: path.relative(PROJECT_ROOT, filePath),
                line: i + 1,
                content: lines[i].trim(),
                pattern: pattern,
                type: 'direct'
              });
            }
          }
        }
      }
      
      // 搜索动态模式
      for (const pattern of dynamicPatterns) {
        const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        if (regex.test(content)) {
          results.found = true;
          
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.dynamicMatches.push({
                file: path.relative(PROJECT_ROOT, filePath),
                line: i + 1,
                content: lines[i].trim(),
                pattern: pattern,
                type: 'dynamic'
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
  console.log('🔍 开始验证未使用的翻译键...');
  console.log('=' .repeat(60));
  
  try {
    // 读取未使用键列表
    const unusedKeysContent = fs.readFileSync(UNUSED_KEYS_FILE, 'utf8');
    const unusedKeys = unusedKeysContent
      .split('\n')
      .filter(line => line && !line.startsWith('#'))
      .map(line => line.trim());
    
    console.log(`📊 需要验证的未使用键: ${unusedKeys.length} 个`);
    
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
    
    // 验证结果
    const trulyUnused = [];
    const actuallyUsed = [];
    const dynamicallyUsed = [];
    
    console.log('🔍 开始深度验证键的使用情况...');
    
    // 分批处理
    const batchSize = 20;
    for (let i = 0; i < unusedKeys.length; i += batchSize) {
      const batch = unusedKeys.slice(i, i + batchSize);
      const progress = ((i / unusedKeys.length) * 100).toFixed(1);
      console.log(`验证进度: ${progress}% (${i + 1}-${Math.min(i + batchSize, unusedKeys.length)}/${unusedKeys.length})`);
      
      for (const key of batch) {
        const result = deepSearchKey(key, allFiles);
        
        if (result.found) {
          if (result.dynamicMatches.length > 0) {
            dynamicallyUsed.push({ key, result });
          } else {
            actuallyUsed.push({ key, result });
          }
        } else {
          trulyUnused.push(key);
        }
      }
    }
    
    console.log('');
    console.log('📈 验证结果统计:');
    console.log('=' .repeat(60));
    console.log(`✅ 实际被使用的键: ${actuallyUsed.length} 个`);
    console.log(`🔄 动态使用的键: ${dynamicallyUsed.length} 个`);
    console.log(`❌ 真正未使用的键: ${trulyUnused.length} 个`);
    console.log(`📊 真实未使用率: ${((trulyUnused.length / unusedKeys.length) * 100).toFixed(2)}%`);
    console.log('');
    
    // 显示实际被使用的键
    if (actuallyUsed.length > 0) {
      console.log('✅ 实际被使用的键 (前10个):');
      console.log('-' .repeat(40));
      actuallyUsed.slice(0, 10).forEach(({ key, result }) => {
        console.log(`  ✓ ${key}`);
        if (result.matches.length > 0) {
          const firstMatch = result.matches[0];
          console.log(`    └─ ${firstMatch.file}:${firstMatch.line}`);
          console.log(`       ${firstMatch.content.substring(0, 60)}${firstMatch.content.length > 60 ? '...' : ''}`);
        }
      });
      if (actuallyUsed.length > 10) {
        console.log(`    ... 还有 ${actuallyUsed.length - 10} 个`);
      }
    }
    
    // 显示动态使用的键
    if (dynamicallyUsed.length > 0) {
      console.log('\n🔄 动态使用的键 (前5个):');
      console.log('-' .repeat(40));
      dynamicallyUsed.slice(0, 5).forEach(({ key, result }) => {
        console.log(`  🔄 ${key}`);
        if (result.dynamicMatches.length > 0) {
          const firstMatch = result.dynamicMatches[0];
          console.log(`    └─ ${firstMatch.file}:${firstMatch.line}`);
          console.log(`       ${firstMatch.content.substring(0, 60)}${firstMatch.content.length > 60 ? '...' : ''}`);
        }
      });
      if (dynamicallyUsed.length > 5) {
        console.log(`    ... 还有 ${dynamicallyUsed.length - 5} 个`);
      }
    }
    
    // 显示真正未使用的键
    if (trulyUnused.length > 0) {
      console.log('\n❌ 真正未使用的翻译键:');
      console.log('-' .repeat(40));
      
      // 按命名空间分组
      const unusedByNamespace = {};
      trulyUnused.forEach(key => {
        const namespace = key.split('.')[0];
        if (!unusedByNamespace[namespace]) {
          unusedByNamespace[namespace] = [];
        }
        unusedByNamespace[namespace].push(key);
      });
      
      Object.entries(unusedByNamespace).forEach(([namespace, keys]) => {
        console.log(`\n📁 ${namespace} 命名空间 (${keys.length} 个真正未使用):`);
        keys.slice(0, 15).forEach(key => {
          console.log(`  - ${key}`);
        });
        if (keys.length > 15) {
          console.log(`  ... 还有 ${keys.length - 15} 个`);
        }
      });
    }
    
    // 生成验证报告
    const verificationReport = {
      timestamp: new Date().toISOString(),
      summary: {
        totalVerified: unusedKeys.length,
        actuallyUsed: actuallyUsed.length,
        dynamicallyUsed: dynamicallyUsed.length,
        trulyUnused: trulyUnused.length,
        trueUnusedRate: ((trulyUnused.length / unusedKeys.length) * 100).toFixed(2) + '%'
      },
      actuallyUsed: actuallyUsed.map(item => ({
        key: item.key,
        matches: item.result.matches.slice(0, 3) // 只保存前3个匹配
      })),
      dynamicallyUsed: dynamicallyUsed.map(item => ({
        key: item.key,
        dynamicMatches: item.result.dynamicMatches.slice(0, 3)
      })),
      trulyUnused: trulyUnused
    };
    
    const reportPath = path.join(__dirname, 'key_verification_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(verificationReport, null, 2), 'utf8');
    console.log(`\n📄 验证报告已保存到: ${reportPath}`);
    
    // 生成真正未使用的键列表
    const trulyUnusedPath = path.join(__dirname, 'truly_unused_keys.txt');
    const trulyUnusedContent = [
      '# 真正未使用的翻译键列表',
      `# 生成时间: ${new Date().toLocaleString()}`,
      `# 原始未使用键数: ${unusedKeys.length}`,
      `# 真正未使用键数: ${trulyUnused.length}`,
      `# 真实未使用率: ${((trulyUnused.length / unusedKeys.length) * 100).toFixed(2)}%`,
      '',
      ...trulyUnused
    ].join('\n');
    
    fs.writeFileSync(trulyUnusedPath, trulyUnusedContent, 'utf8');
    console.log(`📄 真正未使用键列表已保存到: ${trulyUnusedPath}`);
    
    console.log('');
    console.log('✨ 验证完成!');
    
  } catch (error) {
    console.error('❌ 验证过程中出错:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = {
  deepSearchKey,
  main
};