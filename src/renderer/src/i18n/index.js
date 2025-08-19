import { createI18n } from 'vue-i18n'
import { getAllTranslations, getTranslation } from '../../../shared/i18n'

// 获取当前语言设置（默认为英文）
const currentLocale = 'en' // 可以从设置中获取

// 加载翻译数据
const messages = {
  en: getAllTranslations('en'),
  'zh-CN': getAllTranslations('zh-CN')
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

// 导出i18n实例（命名导出和默认导出）
export { i18n }
export default i18n

// 监听语言变化
if (window.electron && window.electron.ipcRenderer) {
  window.electron.ipcRenderer.on('language-changed', (event, newLocale) => {
    i18n.global.locale.value = newLocale
  })
}