import { createI18n } from 'vue-i18n'

// 直接导入翻译文件
import enTranslations from '../../../shared/i18n/locales/en.json'
import zhCNTranslations from '../../../shared/i18n/locales/zh-CN.json'
import zhTWTranslations from '../../../shared/i18n/locales/zh-TW.json'
import esTranslations from '../../../shared/i18n/locales/es.json'
import frTranslations from '../../../shared/i18n/locales/fr.json'
import deTranslations from '../../../shared/i18n/locales/de.json'
import jaTranslations from '../../../shared/i18n/locales/ja.json'
import koTranslations from '../../../shared/i18n/locales/ko.json'
import ptTranslations from '../../../shared/i18n/locales/pt.json'

// 获取当前语言设置
let currentLocale = 'en' // 默认为英文，将在偏好设置加载后更新

// 加载翻译数据
const messages = {
  en: enTranslations,
  'zh-CN': zhCNTranslations,
  'zh-TW': zhTWTranslations,
  es: esTranslations,
  fr: frTranslations,
  de: deTranslations,
  ja: jaTranslations,
  ko: koTranslations,
  pt: ptTranslations
}

// 创建Vue i18n实例
const i18n = createI18n({
  legacy: false,
  locale: currentLocale,
  fallbackLocale: 'en',
  messages
})

// 导出翻译函数
export const t = i18n.global.t

// 导出语言设置函数
export const setLanguage = (locale) => {
  if (locale && messages[locale]) {
    i18n.global.locale.value = locale
    currentLocale = locale
  }
}

// 导出获取当前语言函数
export const getCurrentLanguage = () => currentLocale

// 导出i18n实例（命名导出和默认导出）
export { i18n }
export default i18n

// 监听语言变化
if (window.electron && window.electron.ipcRenderer) {
  window.electron.ipcRenderer.on('language-changed', (event, newLocale) => {
    i18n.global.locale.value = newLocale
  })
}