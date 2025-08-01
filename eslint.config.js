import eslintJs from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import pluginHtml from 'eslint-plugin-html'
import neostandard from 'neostandard'
import babelParser from '@babel/eslint-parser'
const { configs: js } = eslintJs

export default [
  // 0. ESLint core recommended rules

  js.recommended,
  // 1. Use neostandard instead
  ...neostandard(),

  ...pluginVue.configs['flat/recommended'],

  // 3. Your custom overrides
  {
    plugins: {
      html: pluginHtml
    },
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        MARKTEXT_VERSION_STRING: 'readonly',
        MARKTEXT_VERSION: 'readonly',
        __static: 'readonly'
      }
    },
    rules: {
      indent: ['error', 2, { SwitchCase: 1, ignoreComments: true }],
      semi: ['error', 'never'],
      'no-return-await': 'error',
      'no-return-assign': 'error',
      'no-new': 'error',
      'arrow-parens': 'off',
      'no-console': 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'require-atomic-updates': 'off',
      'prefer-const': 'off',
      'no-mixed-operators': 'off',
      'no-prototype-builtins': 'off',
      'space-before-function-paren': 'never'
    },
    ignores: ['node_modules', 'src/muya/dist/**/*', 'src/muya/webpack.config.js']
  }
]
