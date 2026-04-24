import eslintJs from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import pluginHtml from 'eslint-plugin-html'
import pluginI18nJson from 'eslint-plugin-i18n-json'
import pluginJsonc from 'eslint-plugin-jsonc'
import neostandard from 'neostandard'
import babelParser from '@babel/eslint-parser'
const { configs: js } = eslintJs

export default [
  // Global ignores (must be a config object with ONLY `ignores` to work as
  // global ignore in ESLint 9 flat config; previously this was placed
  // alongside `rules` and silently scoped to that block only — letting
  // build output and vendored minified libs slip into the lint pass and
  // produce ~986k errors).
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'build/**',
      'src/muya/dist/**',
      'src/muya/webpack.config.js',
      'src/muya/lib/assets/libs/**',
      '**/*.min.js',
      'static/**',
      '*.lock',
      'package-lock.json'
    ]
  },

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
      'space-before-function-paren': ['error', 'never']
    }
  },

  // 4. JSON files basic validation
  ...pluginJsonc.configs['flat/recommended-with-json'],

  // 5. i18n JSON files validation
  {
    files: ['src/shared/i18n/locales/*.json'],
    plugins: {
      'i18n-json': pluginI18nJson
    },
    rules: {
      'i18n-json/valid-json': 'error',
      'i18n-json/sorted-keys': 'warn',
      'i18n-json/identical-keys': [
        'error',
        {
          filePath: 'src/shared/i18n/locales/en.json'
        }
      ]
    }
  }
]
