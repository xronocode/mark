const fs = require('fs');
const path = require('path');

/**
 * 生成最终的翻译键分析报告
 */
function generateFinalReport() {
  console.log('📊 生成最终翻译键分析报告');
  console.log('=' .repeat(80));
  
  try {
    // 读取验证报告
    const verificationReportPath = path.join(__dirname, 'key_verification_report.json');
    const verificationReport = JSON.parse(fs.readFileSync(verificationReportPath, 'utf8'));
    
    // 读取真正未使用的键
    const trulyUnusedPath = path.join(__dirname, 'truly_unused_keys.txt');
    const trulyUnusedContent = fs.readFileSync(trulyUnusedPath, 'utf8');
    const trulyUnusedKeys = trulyUnusedContent
      .split('\n')
      .filter(line => line && !line.startsWith('#'))
      .map(line => line.trim());
    
    // 按命名空间分组分析
    const namespaceAnalysis = {};
    const allKeys = [
      ...verificationReport.actuallyUsed.map(item => item.key),
      ...verificationReport.dynamicallyUsed.map(item => item.key),
      ...trulyUnusedKeys
    ];
    
    allKeys.forEach(key => {
      const namespace = key.split('.')[0];
      if (!namespaceAnalysis[namespace]) {
        namespaceAnalysis[namespace] = {
          total: 0,
          used: 0,
          dynamicallyUsed: 0,
          unused: 0,
          usedKeys: [],
          dynamicallyUsedKeys: [],
          unusedKeys: []
        };
      }
      namespaceAnalysis[namespace].total++;
    });
    
    // 统计各命名空间的使用情况
    verificationReport.actuallyUsed.forEach(item => {
      const namespace = item.key.split('.')[0];
      if (namespaceAnalysis[namespace]) {
        namespaceAnalysis[namespace].used++;
        namespaceAnalysis[namespace].usedKeys.push(item.key);
      }
    });
    
    verificationReport.dynamicallyUsed.forEach(item => {
      const namespace = item.key.split('.')[0];
      if (namespaceAnalysis[namespace]) {
        namespaceAnalysis[namespace].dynamicallyUsed++;
        namespaceAnalysis[namespace].dynamicallyUsedKeys.push(item.key);
      }
    });
    
    trulyUnusedKeys.forEach(key => {
      const namespace = key.split('.')[0];
      if (namespaceAnalysis[namespace]) {
        namespaceAnalysis[namespace].unused++;
        namespaceAnalysis[namespace].unusedKeys.push(key);
      }
    });
    
    // 生成报告
    console.log('📈 总体统计:');
    console.log('-' .repeat(60));
    console.log(`总翻译键数: ${verificationReport.summary.totalVerified}`);
    console.log(`实际使用: ${verificationReport.summary.actuallyUsed} (${((verificationReport.summary.actuallyUsed / verificationReport.summary.totalVerified) * 100).toFixed(2)}%)`);
    console.log(`动态使用: ${verificationReport.summary.dynamicallyUsed} (${((verificationReport.summary.dynamicallyUsed / verificationReport.summary.totalVerified) * 100).toFixed(2)}%)`);
    console.log(`真正未使用: ${verificationReport.summary.trulyUnused} (${verificationReport.summary.trueUnusedRate})`);
    console.log('');
    
    console.log('📁 各命名空间使用情况分析:');
    console.log('-' .repeat(60));
    
    // 按使用率排序
    const sortedNamespaces = Object.entries(namespaceAnalysis)
      .map(([namespace, data]) => ({
        namespace,
        ...data,
        usageRate: ((data.used + data.dynamicallyUsed) / data.total * 100).toFixed(2)
      }))
      .sort((a, b) => parseFloat(b.usageRate) - parseFloat(a.usageRate));
    
    sortedNamespaces.forEach(ns => {
      const status = parseFloat(ns.usageRate) >= 80 ? '✅' : 
                    parseFloat(ns.usageRate) >= 50 ? '⚠️' : '❌';
      
      console.log(`${status} ${ns.namespace}:`);
      console.log(`   总数: ${ns.total}, 使用: ${ns.used + ns.dynamicallyUsed}, 未使用: ${ns.unused}`);
      console.log(`   使用率: ${ns.usageRate}%`);
      
      if (ns.unused > 0) {
        console.log(`   未使用键: ${ns.unusedKeys.slice(0, 3).join(', ')}${ns.unusedKeys.length > 3 ? ` 等${ns.unusedKeys.length}个` : ''}`);
      }
      console.log('');
    });
    
    // 生成建议
    console.log('💡 优化建议:');
    console.log('-' .repeat(60));
    
    const highUnusageNamespaces = sortedNamespaces.filter(ns => parseFloat(ns.usageRate) < 50);
    const mediumUnusageNamespaces = sortedNamespaces.filter(ns => parseFloat(ns.usageRate) >= 50 && parseFloat(ns.usageRate) < 80);
    
    if (highUnusageNamespaces.length > 0) {
      console.log('🔴 高优先级清理 (使用率 < 50%):');
      highUnusageNamespaces.forEach(ns => {
        console.log(`   - ${ns.namespace}: ${ns.unused}个未使用键，建议重点审查`);
      });
      console.log('');
    }
    
    if (mediumUnusageNamespaces.length > 0) {
      console.log('🟡 中优先级清理 (使用率 50%-80%):');
      mediumUnusageNamespaces.forEach(ns => {
        console.log(`   - ${ns.namespace}: ${ns.unused}个未使用键，建议适度清理`);
      });
      console.log('');
    }
    
    // 特殊关注的命名空间
    const specialAttention = [
      'menu',
      'commands',
      'preferences',
      'editor'
    ];
    
    console.log('⭐ 特别关注的核心命名空间:');
    specialAttention.forEach(namespace => {
      const ns = sortedNamespaces.find(n => n.namespace === namespace);
      if (ns) {
        const status = parseFloat(ns.usageRate) >= 90 ? '优秀' :
                      parseFloat(ns.usageRate) >= 70 ? '良好' :
                      parseFloat(ns.usageRate) >= 50 ? '一般' : '需要优化';
        console.log(`   - ${namespace}: ${ns.usageRate}% (${status})`);
        if (ns.unused > 0) {
          console.log(`     未使用: ${ns.unused}个键`);
        }
      }
    });
    
    console.log('');
    console.log('📋 清理建议总结:');
    console.log('-' .repeat(60));
    console.log(`1. 可以安全删除的键: ${trulyUnusedKeys.length}个`);
    console.log(`2. 需要代码审查的命名空间: ${highUnusageNamespaces.length}个`);
    console.log(`3. 整体代码使用率: ${((verificationReport.summary.actuallyUsed + verificationReport.summary.dynamicallyUsed) / verificationReport.summary.totalVerified * 100).toFixed(2)}%`);
    
    if (trulyUnusedKeys.length > 0) {
      console.log('');
      console.log('🗑️ 建议删除的键 (按命名空间分组):');
      console.log('-' .repeat(60));
      
      const unusedByNamespace = {};
      trulyUnusedKeys.forEach(key => {
        const namespace = key.split('.')[0];
        if (!unusedByNamespace[namespace]) {
          unusedByNamespace[namespace] = [];
        }
        unusedByNamespace[namespace].push(key);
      });
      
      Object.entries(unusedByNamespace)
        .sort(([,a], [,b]) => b.length - a.length)
        .forEach(([namespace, keys]) => {
          console.log(`\n📁 ${namespace} (${keys.length}个):`);
          keys.forEach(key => {
            console.log(`   - ${key}`);
          });
        });
    }
    
    // 生成最终报告文件
    const finalReport = {
      timestamp: new Date().toISOString(),
      summary: {
        totalKeys: verificationReport.summary.totalVerified,
        usedKeys: verificationReport.summary.actuallyUsed + verificationReport.summary.dynamicallyUsed,
        unusedKeys: verificationReport.summary.trulyUnused,
        overallUsageRate: ((verificationReport.summary.actuallyUsed + verificationReport.summary.dynamicallyUsed) / verificationReport.summary.totalVerified * 100).toFixed(2) + '%'
      },
      namespaceAnalysis: sortedNamespaces,
      recommendations: {
        highPriorityCleanup: highUnusageNamespaces.map(ns => ns.namespace),
        mediumPriorityCleanup: mediumUnusageNamespaces.map(ns => ns.namespace),
        keysToDelete: trulyUnusedKeys,
        coreNamespacesStatus: specialAttention.map(namespace => {
          const ns = sortedNamespaces.find(n => n.namespace === namespace);
          return ns ? {
            namespace,
            usageRate: ns.usageRate + '%',
            status: parseFloat(ns.usageRate) >= 90 ? '优秀' :
                   parseFloat(ns.usageRate) >= 70 ? '良好' :
                   parseFloat(ns.usageRate) >= 50 ? '一般' : '需要优化'
          } : null;
        }).filter(Boolean)
      }
    };
    
    const finalReportPath = path.join(__dirname, 'final_translation_analysis_report.json');
    fs.writeFileSync(finalReportPath, JSON.stringify(finalReport, null, 2), 'utf8');
    
    console.log('');
    console.log(`📄 最终分析报告已保存到: ${finalReportPath}`);
    console.log('✨ 分析完成!');
    
  } catch (error) {
    console.error('❌ 生成报告时出错:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  generateFinalReport();
}

module.exports = {
  generateFinalReport
};