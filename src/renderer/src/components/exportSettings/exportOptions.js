import { t } from '@/i18n'

export const getPageSizeList = () => [
  {
    label: t('exportSettings.options.pageSizes.a3'),
    value: 'A3'
  }, {
    label: t('exportSettings.options.pageSizes.a4'),
    value: 'A4'
  }, {
    label: t('exportSettings.options.pageSizes.a5'),
    value: 'A5'
  }, {
    label: t('exportSettings.options.pageSizes.legal'),
    value: 'Legal'
  }, {
    label: t('exportSettings.options.pageSizes.letter'),
    value: 'Letter'
  }, {
    label: t('exportSettings.options.pageSizes.tabloid'),
    value: 'Tabloid'
  }, {
    label: t('exportSettings.options.pageSizes.custom'),
    value: 'custom'
  }
]

export const getHeaderFooterTypes = () => [
  {
    label: t('exportSettings.options.headerFooterTypes.none'),
    value: 0
  }, {
    label: t('exportSettings.options.headerFooterTypes.singleCell'),
    value: 1
  }, {
    label: t('exportSettings.options.headerFooterTypes.threeCells'),
    value: 2
  }
]

export const getHeaderFooterStyles = () => [
  {
    label: t('exportSettings.options.headerFooterStyles.default'),
    value: 0
  }, {
    label: t('exportSettings.options.headerFooterStyles.simple'),
    value: 1
  }, {
    label: t('exportSettings.options.headerFooterStyles.styled'),
    value: 2
  }
]

export const getExportThemeList = () => [{
  label: t('exportSettings.options.themes.academic'),
  value: 'academic'
}, {
  label: t('exportSettings.options.themes.default'),
  value: 'default'
}, {
  label: t('exportSettings.options.themes.liber'),
  value: 'liber'
}]

// C-EXPORT-SINGLE-PAGE R-3: margin presets sit in front of the four
// numeric inputs; "normal" mirrors the dialog's factory defaults
// (top/bottom 20, left/right 15 mm).
export const MARGIN_PRESETS = {
  narrow: { pageMarginTop: 10, pageMarginRight: 10, pageMarginBottom: 10, pageMarginLeft: 10 },
  normal: { pageMarginTop: 20, pageMarginRight: 15, pageMarginBottom: 20, pageMarginLeft: 15 },
  wide: { pageMarginTop: 30, pageMarginRight: 25, pageMarginBottom: 30, pageMarginLeft: 25 }
}

export const getMarginPresetList = () => [
  {
    label: t('exportSettings.options.marginPresets.narrow'),
    value: 'narrow'
  }, {
    label: t('exportSettings.options.marginPresets.normal'),
    value: 'normal'
  }, {
    label: t('exportSettings.options.marginPresets.wide'),
    value: 'wide'
  }, {
    label: t('exportSettings.options.marginPresets.custom'),
    value: 'custom'
  }
]

// Returns the preset name the four margin values match, or 'custom'.
export const matchMarginPreset = values => {
  if (!values || typeof values !== 'object') return 'custom'
  for (const [name, preset] of Object.entries(MARGIN_PRESETS)) {
    const matches = Object.keys(preset).every(
      key => Number(preset[key]) === Number(values[key])
    )
    if (matches) return name
  }
  return 'custom'
}

// C-EXPORT-SINGLE-PAGE R-4: the slot strips replace the legacy
// none/single-cell/three-cells selects; the type integer survives as an
// internal encoding derived from which slots carry text (0 none,
// 1 single centre cell, 2 three cells). A three-cell layout with empty
// side strings normalizes to single-cell — visually equivalent.
export const deriveHeaderFooterType = ({ left = '', center = '', right = '' } = {}) => {
  const hasText = v => typeof v === 'string' && v.trim() !== ''
  if (hasText(left) || hasText(right)) return 2
  if (hasText(center)) return 1
  return 0
}

// 为了向后兼容，保留原有的导出
export const pageSizeList = getPageSizeList()
export const headerFooterTypes = getHeaderFooterTypes()
export const headerFooterStyles = getHeaderFooterStyles()
export const exportThemeList = getExportThemeList()
