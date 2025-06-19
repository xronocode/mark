const viteConfig = require('./vite.config.js')

module.exports = {
  root: true,
  parserOptions: {
    parser: '@babel/eslint-parser',
    ecmaVersion: 11,
    ecmaFeatures: {
      impliedStrict: true
    },
    sourceType: 'module'
  },
  env: {
    browser: true,
    es6: true,
    node: true
  },
  extends: [
    'standard',
    'eslint:recommended',
    'plugin:vue/vue3-essential',
    'plugin:import/errors',
    'plugin:import/warnings'
  ],
  globals: {
    __static: true
  },
  plugins: ['html', 'vue'],
  rules: {
    // Two spaces but disallow semicolons
    indent: ['error', 2, { SwitchCase: 1, ignoreComments: true }],
    semi: [2, 'never'],
    'no-return-await': 'error',
    'no-return-assign': 'error',
    'no-new': 'error',
    // allow paren-less arrow functions
    'arrow-parens': 'off',
    // allow console
    'no-console': 'off',
    // allow debugger during development
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'require-atomic-updates': 'off',
    // TODO: fix these errors someday
    'prefer-const': 'off',
    'no-mixed-operators': 'off',
    'no-prototype-builtins': 'off'
  },
  settings: {
    'import/resolver': {
      vite: {
        viteConfig: {
          resolve: {
            alias: viteConfig.resolve.alias
          }
        }
      }
    }
  },
  ignorePatterns: ['node_modules', 'src/muya/dist/**/*', 'src/muya/webpack.config.js']
}
