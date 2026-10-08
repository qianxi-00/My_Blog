import { defineConfig } from 'vitepress'

// 站点挂在 https://qianxi-00.github.io/My_Blog/ 子路径下，base 必须一致，
// 否则页面能打开但 CSS/JS 全 404。
const BLOG_URL = 'https://blog.qianxi7988.me'

export default defineConfig({
  lang: 'zh-CN',
  title: 'DevLog / My_Blog',
  description: '千禧的个人技术博客系统 —— FastAPI + React + AI 看板娘的全栈实践',
  base: '/My_Blog/',

  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/My_Blog/favicon.svg' }]],

  themeConfig: {
    // 站内导航；「进入博客」是外链，点了直接跳线上博客
    nav: [
      { text: '首页', link: '/' },
      { text: '项目介绍', link: '/intro' },
      { text: '功能特性', link: '/features' },
      { text: '部署指南', link: '/deploy' },
      { text: '🏠 进入博客', link: BLOG_URL },
    ],

    sidebar: [
      {
        text: '开始',
        items: [
          { text: '首页', link: '/' },
          { text: '项目介绍', link: '/intro' },
        ],
      },
      {
        text: '深入了解',
        items: [
          { text: '功能特性', link: '/features' },
          { text: '部署指南', link: '/deploy' },
        ],
      },
      {
        text: '线上站点',
        items: [
          { text: '🏠 博客', link: BLOG_URL },
          { text: '📄 文章列表', link: `${BLOG_URL}/#/articles` },
          { text: '🔥 AI 日报', link: `${BLOG_URL}/#/hotspots` },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/qianxi-00/My_Blog' }],

    outline: { label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    footer: {
      message: '基于 MIT License 发布',
      copyright: `Copyright © 2026-present <a href="${BLOG_URL}" target="_blank">千禧</a> · <a href="https://github.com/qianxi-00/My_Blog" target="_blank">GitHub</a>`,
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除查询',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },
  },
})
