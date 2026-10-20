// FILE: src/muya/lib/ui/imageToolbar/config.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Data model of the embedded-image floating toolbar — the ordered button list (edit, C-56 T-006 Copy image, alignment, delete) with localized tooltips and icons.
//   SCOPE: the getIcons(translateFn) factory only; the Copy-image glyph reuses the C-56 T-005 corner-pill copy geometry (renderBlockToolbar) as inline-SVG data instead of a PNG asset.
//   DEPENDS: pngicon assets (edit/inline/align×3/delete), renderBlockToolbar (TOOLBAR_COPY_ICON_RECT + TOOLBAR_COPY_ICON_PATHS — data constants only).
//   LINKS: .grace/graph/runtime.xml M-012; .grace/changes/archive/C-56 T-006; ui/imageToolbar/index.js (the renderer + click routing); static/locales editor.image.toolbar.* strings.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   getIcons - translateFn → ordered toolbar entries: { type, tooltip, icon } for the PNG-backed buttons and { type, tooltip, svg } for the inline-SVG Copy-image button (svg = { width, height, rect, paths } mockup geometry).
//   default - the same getIcons (default export).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-18 C-56 T-006: first GRACE contract, and
//   a "Copy image" entry (type copyImage, tooltip editor.image.toolbar.
//   copyImage) between edit and the alignment buttons — the glyph is the
//   exact T-005 corner-pill copy icon (two rects + mountain) carried as
//   inline-SVG data so the toolbar keeps one visual family.
//   v1.0.0 - upstream Mark Text image toolbar config (edit/inline/left/
//   center/right/delete with pngicon assets).
// END_CHANGE_SUMMARY

import editIcon from '../../assets/pngicon/imageEdit/2.png'
import inlineIcon from '../../assets/pngicon/inline_image/2.png'
import leftIcon from '../../assets/pngicon/algin_left/2.png'
import middleIcon from '../../assets/pngicon/algin_center/2.png'
import rightIcon from '../../assets/pngicon/algin_right/2.png'
import deleteIcon from '../../assets/pngicon/image_delete/2.png'
import { TOOLBAR_COPY_ICON_PATHS, TOOLBAR_COPY_ICON_RECT } from '../../parser/render/renderBlock/renderBlockToolbar'

export const getIcons = (translateFn) => {
  const t = typeof translateFn === 'function' ? translateFn : (k) => k
  return [
    { type: 'edit', tooltip: t('editor.image.toolbar.edit'), icon: editIcon },
    // C-56 T-006: put the embedded image back on the clipboard as a
    // picture — the transport lives on the host (muya-image-copy event).
    {
      type: 'copyImage',
      tooltip: t('editor.image.toolbar.copyImage'),
      svg: {
        width: 16,
        height: 16,
        rect: { ...TOOLBAR_COPY_ICON_RECT },
        paths: [...TOOLBAR_COPY_ICON_PATHS]
      }
    },
    { type: 'inline', tooltip: t('editor.image.toolbar.inline'), icon: inlineIcon },
    { type: 'left', tooltip: t('editor.image.toolbar.alignLeft'), icon: leftIcon },
    { type: 'center', tooltip: t('editor.image.toolbar.alignCenter'), icon: middleIcon },
    { type: 'right', tooltip: t('editor.image.toolbar.alignRight'), icon: rightIcon },
    { type: 'delete', tooltip: t('editor.image.toolbar.delete'), icon: deleteIcon }
  ]
}

export default getIcons
