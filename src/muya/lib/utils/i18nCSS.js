/**
 * CSS国际化工具
 * 用于动态设置CSS content属性中的文本内容
 */

class I18nCSS {
  constructor(t) {
    this.t = t || ((key) => key) // 翻译函数，如果没有提供则返回原始键值
    // 初始化CSS变量
    this.updateCSSVariables()
  }

  /**
   * 更新CSS变量的值
   */
  updateCSSVariables() {
    const root = document.documentElement
    
    // 更新所有CSS变量
    root.style.setProperty('--i18n-highlight-start', `"${this.t('editor.highlightStart')}"` || '" [highlight start] "')
    root.style.setProperty('--i18n-highlight-end', `"${this.t('editor.highlightEnd')}"` || '" [highlight end] "')
    root.style.setProperty('--i18n-type-at-to-insert', `"${this.t('editor.typeAtToInsert')}"` || '"Type @ to insert"')
    root.style.setProperty('--i18n-input-footnote-definition', `"${this.t('editor.inputFootnoteDefinition')}"` || '"Input the footnote definition..."')
    root.style.setProperty('--i18n-input-yaml-front-matter', `"${this.t('editor.inputYamlFrontMatter')}"` || '"Input YAML Front Matter..."')
    root.style.setProperty('--i18n-input-language-identifier', `"${this.t('editor.inputLanguageIdentifier')}"` || '"Input Language Identifier..."')
    root.style.setProperty('--i18n-input-mathematical-formula', `"${this.t('editor.inputMathematicalFormula')}"` || '"Input Mathematical Formula..."')
    root.style.setProperty('--i18n-fence', `"${this.t('editor.fence')}"` || '"fence"')
    root.style.setProperty('--i18n-indent', `"${this.t('editor.indent')}"` || '"indent"')
    root.style.setProperty('--i18n-front-matter-delimiter', `"${this.t('editor.frontMatterDelimiter')}"` || '"---"')
    root.style.setProperty('--i18n-math-delimiter', `"${this.t('editor.mathDelimiter')}"` || '"$$"')
    root.style.setProperty('--i18n-mermaid-start', `"${this.t('editor.mermaidStart')}"` || '"\\`\\`\\` mermaid"')
    root.style.setProperty('--i18n-flowchart-start', `"${this.t('editor.flowchartStart')}"` || '"\\`\\`\\` flowchart"')
    root.style.setProperty('--i18n-sequence-start', `"${this.t('editor.sequenceStart')}"` || '"\\`\\`\\` sequence"')
    root.style.setProperty('--i18n-plantuml-start', `"${this.t('editor.plantumlStart')}"` || '"\\`\\`\\` plantuml"')
    root.style.setProperty('--i18n-vega-lite-start', `"${this.t('editor.vegaLiteStart')}"` || '"\\`\\`\\` vega-lite"')
    root.style.setProperty('--i18n-code-fence', `"${this.t('editor.codeFence')}"` || '"\\`\\`\\`"')
    root.style.setProperty('--i18n-click-to-add-image', `"${this.t('editor.clickToAddImage')}"` || '"Click to add an image"')
    root.style.setProperty('--i18n-load-image-failed', `"${this.t('editor.loadImageFailed')}"` || '"Load image failed"')
  }

  /**
   * 设置翻译函数
   */
  setTranslationFunction(t) {
    this.t = t || ((key) => key)
    this.updateCSSVariables()
  }
}

export default I18nCSS