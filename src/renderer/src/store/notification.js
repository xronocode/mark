// FILE: src/renderer/src/store/notification.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Thin store facade over the notification service — localized
//            defaults plus pass-through of the C-NOTIFICATION-SYSTEM event
//            fields (severity, source, actions, dedupKey, sticky).
//   SCOPE: SHOW_NOTIFICATION defaulting and forwarding. The Electron-era
//          pandoc-missing toast action (auto-opening pandoc.org from a
//          confirm circle) was dead code since audit-M-1 and is removed by
//          C-NOTIFICATION-SYSTEM T-004 together with its test and the
//          orphan installPandoc locale keys.
//   DEPENDS: pinia, services/notification, i18n.
//   LINKS: .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-4/R-9;
//          store/notifications (the actual stack).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   useNotificationStore - SHOW_NOTIFICATION(opts): merges localized
//     defaults, forwards every C-NOTIFICATION-SYSTEM field to notice.notify.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-23 C-NOTIFICATION-SYSTEM T-004:
//   the pandoc-missing toast action is deleted (dead code, audit-M-1
//   removed its IPC routes; unit test and installPandoc locale keys
//   removed with it); SHOW_NOTIFICATION forwards the new event fields.
// END_CHANGE_SUMMARY

import { defineStore } from 'pinia'
import notice from '../services/notification'
import { t } from '../i18n'

export const useNotificationStore = defineStore('notification', {
  state: () => ({}),
  actions: {
    SHOW_NOTIFICATION(opts) {
      const DEFAULT_OPTS = {
        title: t('notifications.defaultTitle'),
        severity: 'info',
        time: 10000,
        message: t('notifications.defaultMessage')
      }
      notice.notify(Object.assign({}, DEFAULT_OPTS, opts || {}))
    }
  }
})
