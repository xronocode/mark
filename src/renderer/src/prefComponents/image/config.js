import { t } from '../../i18n'

// Image upload ('upload') is retired from the UI for now (2026-10-15); the
// uploader code stays for a possible return.
export const getImageActions = () => [{
  label: t('preferences.image.actions.folder'),
  value: 'folder'
}, {
  label: t('preferences.image.actions.path'),
  value: 'path'
}]
