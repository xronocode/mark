import { getTranslation } from '../shared/i18n'

// 当前语言设置（可以从配置文件或用户设置中获取）
let currentLanguage = 'en'

/**
 * 获取翻译文本
 * @param {string} key - 翻译键
 * @param {object} params - 参数对象
 * @returns {string} 翻译后的文本
 */
export function t(key, params = {}) {
  return getTranslation(key, currentLanguage, params)
}

/**
 * 获取当前语言
 * @returns {string} 当前语言代码
 */
export function getCurrentLanguage() {
  return currentLanguage
}

/**
 * 设置语言
 * @param {string} language - 语言代码
 */
export function setLanguage(language) {
  currentLanguage = language
}

// Vue 插件形式的翻译系统
export default {
  install(app) {
    // 全局属性
    app.config.globalProperties.$t = t
    app.config.globalProperties.$getCurrentLanguage = getCurrentLanguage
    app.config.globalProperties.$setLanguage = setLanguage
    
    // 提供/注入
    app.provide('t', t)
    app.provide('getCurrentLanguage', getCurrentLanguage)
    app.provide('setLanguage', setLanguage)
  }
}