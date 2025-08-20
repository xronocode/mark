const fs = require('fs')
const path = require('path')
const glob = require('glob')

// 从代码中提取翻译键的脚本
class TranslationKeyExtractor {
  constructor() {
    this.extractedKeys = new Set()
    this.filePatterns = [
      'src/**/*.js',
      'src/**/*.vue',
      'src/**/*.ts'
    ]
  }

  // 提取文件中的翻译键
  extractFromFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      
      // 匹配 t('key') 或 t("key") 或 t(`key`) 格式
      const tFunctionRegex = /\bt\(['"`]([^'"`,)]+)['"`]/g
      
      // 匹配 i18n.global.t('key') 格式
      const i18nGlobalRegex = /i18n\.global\.t\(['"`]([^'"`,)]+)['"`]/g
      
      let match
      
      // 提取 t() 函数调用
      while ((match = tFunctionRegex.exec(content)) !== null) {
        const key = match[1].trim()
        if (key && !key.includes('${') && !key.includes('{')) {
          this.extractedKeys.add(key)
        }
      }
      
      // 提取 i18n.global.t() 函数调用
      while ((match = i18nGlobalRegex.exec(content)) !== null) {
        const key = match[1].trim()
        if (key && !key.includes('${') && !key.includes('{')) {
          this.extractedKeys.add(key)
        }
      }
      
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error.message)
    }
  }

  // 扫描所有文件
  async extractAllKeys() {
    console.log('开始从代码中提取翻译键...')
    
    for (const pattern of this.filePatterns) {
      const files = glob.sync(pattern, { cwd: process.cwd() })
      
      for (const file of files) {
        this.extractFromFile(file)
      }
    }
    
    console.log(`总共提取到 ${this.extractedKeys.size} 个翻译键`)
    return Array.from(this.extractedKeys).sort()
  }

  // 将键转换为嵌套对象结构
  createNestedStructure(keys) {
    const result = {}
    
    keys.forEach(key => {
      const parts = key.split('.')
      let current = result
      
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // 最后一个部分，设置为 true
          current[part] = true
        } else {
          // 中间部分，创建嵌套对象
          if (!current[part]) {
            current[part] = {}
          }
          current = current[part]
        }
      })
    })
    
    return result
  }

  // 保存结果到文件
  saveResults(keys) {
    // 保存扁平列表
    const flatFile = 'extracted_translation_keys_flat.json'
    fs.writeFileSync(flatFile, JSON.stringify(keys, null, 2))
    console.log(`扁平键列表已保存到: ${flatFile}`)
    
    // 保存嵌套结构
    const nestedStructure = this.createNestedStructure(keys)
    const nestedFile = 'extracted_translation_keys.json'
    fs.writeFileSync(nestedFile, JSON.stringify(nestedStructure, null, 2))
    console.log(`嵌套键结构已保存到: ${nestedFile}`)
    
    return { flatKeys: keys, nestedStructure }
  }
}

// 主函数
async function main() {
  try {
    const extractor = new TranslationKeyExtractor()
    const keys = await extractor.extractAllKeys()
    
    console.log('\n提取到的翻译键示例:')
    keys.slice(0, 10).forEach(key => console.log(`  ${key}`))
    if (keys.length > 10) {
      console.log(`  ... 还有 ${keys.length - 10} 个键`)
    }
    
    const results = extractor.saveResults(keys)
    
    console.log('\n提取完成！')
    console.log(`- 总键数: ${keys.length}`)
    console.log(`- 扁平文件: extracted_translation_keys_flat.json`)
    console.log(`- 嵌套文件: extracted_translation_keys.json`)
    
  } catch (error) {
    console.error('提取过程中发生错误:', error)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = TranslationKeyExtractor