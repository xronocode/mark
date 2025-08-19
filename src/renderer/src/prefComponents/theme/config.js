export const themes = [
  {
    name: 'light'
  },
  {
    name: 'dark'
  },
  {
    name: 'graphite'
  },
  {
    name: 'material-dark'
  },
  {
    name: 'ulysses'
  },
  {
    name: 'one-dark'
  }
]

import { useI18n } from 'vue-i18n'

const { t } = useI18n()

export const autoSwitchThemeOptions = [{
  label: t('preferences.theme.autoSwitchOptions.startup'),
  value: 0
}, /* {
  label: 'Only at runtime',
  value: 1
}, */ {
  label: t('preferences.theme.autoSwitchOptions.never'),
  value: 2
}]
