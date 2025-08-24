#!/usr/bin/env node

/**
 * i18n 调试工具脚本
 * 用于手动测试和调试国际化资源文件
 * 
 * 使用方法：
 * node temp/i18n-debug-tool.js [command] [options]
 * 
 * 命令：
 * validate - 验证所有翻译文件
 * test-key <key> [language] - 测试特定翻译键
 * find-paths [language] - 查找翻译文件路径
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 支持的语言列表
const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'zh-TW', 'es', 'fr', 'de', 'ja', 'ko', 'pt']

/**
 * 获取所有可能的翻译文件路径
 */
function getPossibleTranslationPaths(language) {
  const projectRoot = path.join(__dirname, '..')
  return [
    // 构建后的路径（主进程）
    path.join(projectRoot, 'out', 'main', 'locales', `${language}.json`),
    // 开发环境路径
    path.join(projectRoot, 'src', 'shared', 'i18n', 'locales', `${language}.json`),
    path.join(projectRoot, 'src', 'main', 'locales', `${language}.json`),
    path.join(projectRoot, 'locales', `${language}.json`)
  ]
}

/**
 * 验证单个翻译文件
 */
function validateTranslationFile(filePath, language) {
  const result = {
    language,
    filePath,
    exists: false,
    readable: false,
    validJson: false,
    parseError: null,
    content: null,
    keyCount: 0,
    issues: []
  }

  try {
    // 检查文件是否存在
    result.exists = fs.existsSync(filePath)
    if (!result.exists) {
      result.issues.push('File does not exist')
      return result
    }

    // 检查文件是否可读
    try {
      fs.accessSync(filePath, fs.constants.R_OK)
      result.readable = true
    } catch (error) {
      result.issues.push(`File not readable: ${error.message}`)
      return result
    }

    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf8')
    
    // 检查文件是否为空
    if (!content.trim()) {
      result.issues.push('File is empty')
      return result
    }
    
    // 尝试解析 JSON
    try {
      const parsedContent = JSON.parse(content)
      result.validJson = true
      result.content = parsedContent
      result.keyCount = countKeys(parsedContent)
      
      // 检查常见问题
      checkCommonIssues(parsedContent, result)
      
    } catch (parseError) {
      result.parseError = {
        message: parseError.message,
        line: parseError.lineNumber || 'unknown',
        column: parseError.columnNumber || 'unknown'
      }
      result.issues.push(`JSON parse error: ${parseError.message}`)
    }

  } catch (error) {
    result.issues.push(`Unexpected error: ${error.message}`)
  }

  return result
}

/**
 * 递归计算对象中的键数量
 */
function countKeys(obj, depth = 0) {
  if (typeof obj !== 'object' || obj === null) {
    return 0
  }
  
  let count = 0
  for (const key in obj) {
    count++
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      count += countKeys(obj[key], depth + 1)
    }
  }
  return count
}

/**
 * 检查翻译文件中的常见问题
 */
function checkCommonIssues(content, result) {
  // 检查是否包含可能导致 Vue i18n 错误的字符
  const problematicStrings = findProblematicStrings(content)
  if (problematicStrings.length > 0) {
    result.issues.push(`Found ${problematicStrings.length} strings with potential Vue i18n syntax issues`)
    problematicStrings.forEach(item => {
      result.issues.push(`  - Key "${item.key}": contains "${item.char}" which may be interpreted as plural syntax`)
    })
  }
  
  // 检查空值
  const emptyValues = findEmptyValues(content)
  if (emptyValues.length > 0) {
    result.issues.push(`Found ${emptyValues.length} empty translation values`)
    emptyValues.forEach(key => {
      result.issues.push(`  - Key "${key}" has empty value`)
    })
  }
}

/**
 * 查找可能导致问题的字符串
 */
function findProblematicStrings(obj, prefix = '') {
  const problematic = []
  
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    
    if (typeof value === 'string') {
      // 检查可能被 Vue i18n 误解为复数语法的字符
      if (value.includes('|') && !value.match(/^\s*\{.*\}\s*$/)) {
        problematic.push({ key: fullKey, char: '|', value })
      }
      if (value.includes('{') && value.includes('}') && !value.match(/^\s*\{[^{}]*\}\s*$/)) {
        problematic.push({ key: fullKey, char: '{}', value })
      }
    } else if (typeof value === 'object' && value !== null) {
      problematic.push(...findProblematicStrings(value, fullKey))
    }
  }
  
  return problematic
}

/**
 * 查找空值
 */
function findEmptyValues(obj, prefix = '') {
  const empty = []
  
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    
    if (typeof value === 'string' && value.trim() === '') {
      empty.push(fullKey)
    } else if (typeof value === 'object' && value !== null) {
      empty.push(...findEmptyValues(value, fullKey))
    }
  }
  
  return empty
}

/**
 * 验证所有翻译文件
 */
function validateAllFiles() {
  console.log('🔍 Validating all translation files...\n')
  
  const results = {}
  let totalValid = 0
  let totalInvalid = 0
  let totalMissing = 0
  
  for (const language of SUPPORTED_LANGUAGES) {
    console.log(`📁 Checking ${language}...`)
    
    const possiblePaths = getPossibleTranslationPaths(language)
    let found = false
    
    for (const filePath of possiblePaths) {
      const result = validateTranslationFile(filePath, language)
      if (result.exists) {
        results[language] = result
        found = true
        
        if (result.validJson) {
          console.log(`  ✅ Valid: ${result.keyCount} keys`)
          if (result.issues.length > 0) {
            console.log(`  ⚠️  Issues found:`)
            result.issues.forEach(issue => console.log(`     ${issue}`))
          }
          totalValid++
        } else {
          console.log(`  ❌ Invalid: ${result.parseError?.message || 'Unknown error'}`)
          totalInvalid++
        }
        break
      }
    }
    
    if (!found) {
      console.log(`  ❓ Missing: File not found in any expected location`)
      results[language] = {
        language,
        exists: false,
        issues: ['File not found in any expected location']
      }
      totalMissing++
    }
    
    console.log()
  }
  
  // 总结
  console.log('📊 Summary:')
  console.log(`  Valid files: ${totalValid}/${SUPPORTED_LANGUAGES.length}`)
  console.log(`  Invalid files: ${totalInvalid}`)
  console.log(`  Missing files: ${totalMissing}`)
  
  return results
}

/**
 * 测试特定翻译键
 */
function testTranslationKey(key, language = 'en') {
  console.log(`🔍 Testing translation key: "${key}" in language: ${language}\n`)
  
  const possiblePaths = getPossibleTranslationPaths(language)
  let translationData = null
  let usedPath = null
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        translationData = JSON.parse(content)
        usedPath = filePath
        break
      } catch (error) {
        console.log(`❌ Error reading ${filePath}: ${error.message}`)
      }
    }
  }
  
  if (!translationData) {
    console.log(`❌ Translation file not found for language: ${language}`)
    return
  }
  
  console.log(`📁 Using file: ${usedPath}`)
  
  // 支持嵌套键（如 'menu.file.open'）
  const keys = key.split('.')
  let value = translationData
  let path = []
  
  for (const k of keys) {
    path.push(k)
    if (value && typeof value === 'object' && k in value) {
      value = value[k]
    } else {
      console.log(`❌ Key not found: "${path.join('.')}" does not exist`)
      
      // 显示可用的键
      if (value && typeof value === 'object') {
        const availableKeys = Object.keys(value)
        if (availableKeys.length > 0) {
          console.log(`\n💡 Available keys at "${path.slice(0, -1).join('.')}": ${availableKeys.join(', ')}`)
        }
      }
      return
    }
  }
  
  console.log(`✅ Key found!`)
  console.log(`📝 Value: "${value}"`)
  console.log(`🔧 Type: ${typeof value}`)
  
  // 检查值是否可能有问题
  if (typeof value === 'string') {
    if (value.includes('|')) {
      console.log(`⚠️  Warning: Value contains "|" which may be interpreted as Vue i18n plural syntax`)
    }
    if (value.trim() === '') {
      console.log(`⚠️  Warning: Value is empty`)
    }
  }
}

/**
 * 查找翻译文件路径
 */
function findTranslationPaths(language) {
  const lang = language || 'all'
  console.log(`🔍 Finding translation file paths for: ${lang}\n`)
  
  const languages = lang === 'all' ? SUPPORTED_LANGUAGES : [lang]
  
  for (const l of languages) {
    console.log(`📁 ${l}:`)
    const possiblePaths = getPossibleTranslationPaths(l)
    
    for (const filePath of possiblePaths) {
      const exists = fs.existsSync(filePath)
      const status = exists ? '✅ EXISTS' : '❌ NOT FOUND'
      console.log(`  ${status} ${filePath}`)
    }
    console.log()
  }
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  
  console.log('🌐 MarkText i18n Debug Tool\n')
  
  switch (command) {
    case 'validate':
      validateAllFiles()
      break
      
    case 'test-key':
      const key = args[1]
      const language = args[2] || 'en'
      if (!key) {
        console.log('❌ Please provide a translation key to test')
        console.log('Usage: node temp/i18n-debug-tool.js test-key <key> [language]')
        process.exit(1)
      }
      testTranslationKey(key, language)
      break
      
    case 'find-paths':
      const lang = args[1]
      findTranslationPaths(lang)
      break
      
    default:
      console.log('Usage: node temp/i18n-debug-tool.js <command> [options]\n')
      console.log('Commands:')
      console.log('  validate                    - Validate all translation files')
      console.log('  test-key <key> [language]   - Test a specific translation key')
      console.log('  find-paths [language]       - Find translation file paths')
      console.log('\nExamples:')
      console.log('  node temp/i18n-debug-tool.js validate')
      console.log('  node temp/i18n-debug-tool.js test-key "menu.file.open" zh-CN')
      console.log('  node temp/i18n-debug-tool.js find-paths en')
      break
  }
}

// 运行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export {
  validateAllFiles,
  testTranslationKey,
  findTranslationPaths,
  validateTranslationFile
}