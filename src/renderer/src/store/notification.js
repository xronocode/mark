import { defineStore } from 'pinia'
import notice from '../services/notification'
import { t } from '../i18n'

export const useNotificationStore = defineStore('notification', {
  state: () => ({}),
  actions: {
    SHOW_NOTIFICATION(opts) {
      const DEFAULT_OPTS = {
        title: t('notifications.defaultTitle'),
        type: 'primary',
        time: 10000,
        message: t('notifications.defaultMessage')
      }
      notice.notify(Object.assign({}, DEFAULT_OPTS, opts || {}))
    },

    async SHOW_PANDOC_MISSING(opts) {
      const DEFAULT_OPTS = {
        title: t('notifications.defaultTitle'),
        type: 'primary',
        time: 10000,
        message: t('notifications.defaultMessage')
      }
      const options = Object.assign({}, DEFAULT_OPTS, opts || {})
      options.showConfirm = true
      await notice.notify(options)
      window.electron.shell.openExternal('http://pandoc.org')
    }
  }
})
