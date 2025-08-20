import { createI18n } from 'vue-i18n'
import { getAllTranslations, getTranslation } from '../../../shared/i18n'

// 获取当前语言设置
let currentLocale = 'en' // 默认为英文，将在偏好设置加载后更新

// 加载翻译数据
const messages = {
  en: getAllTranslations('en'),
  'zh-CN': getAllTranslations('zh-CN'),
  'zh-TW': getAllTranslations('zh-TW'),
  es: getAllTranslations('es'),
  fr: getAllTranslations('fr'),
  de: getAllTranslations('de'),
  ja: getAllTranslations('ja'),
  ko: getAllTranslations('ko'),
  pt: getAllTranslations('pt')
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