import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Mark',
  description: 'A modern WYSIWYG Markdown editor built with Tauri',
  base: '/mark/',
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/mark/logo.png' }]
  ],
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'GitHub', link: 'https://github.com/xronocode/mark' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quickstart' }
          ]
        },
        {
          text: 'Features',
          items: [
            { text: 'Editor Basics', link: '/guide/editor' },
            { text: 'Keyboard Shortcuts', link: '/guide/shortcuts' },
            { text: 'Themes', link: '/guide/themes' },
            { text: 'Project Sidebar', link: '/guide/project-sidebar' },
            { text: 'Search', link: '/guide/search' },
            { text: 'Diff View', link: '/guide/diff-view' },
            { text: 'CLI Usage', link: '/guide/cli' },
            { text: 'Export', link: '/guide/export' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Rust API (cargo doc)', link: '/reference/rust-api' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/xronocode/mark' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2017+ Jocs, 2024+ tkaixiang, 2026+ xronocode'
    }
  }
})
