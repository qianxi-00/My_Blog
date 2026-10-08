---
# VitePress home 布局：Hero 区 + Features 卡片
layout: home

hero:
  name: DevLog / My_Blog
  text: 千禧的个人技术博客系统
  tagline: FastAPI · React 19 · AI 看板娘 —— 从零构建的全栈博客，记录大模型路上的干货与踩坑
  actions:
    - theme: brand
      text: 🚀 进入博客
      link: https://blog.qianxi7988.me
    - theme: alt
      text: 项目介绍
      link: /intro/
    - theme: alt
      text: GitHub
      link: https://github.com/qianxi-00/My_Blog

features:
  - icon: 📝
    title: 技术文章
    details: Markdown / 数学公式 / Mermaid 图表全支持，按分类、标签、归档三维度组织内容。
    link: https://blog.qianxi7988.me/#/articles
    linkText: 去读文章
  - icon: 🐾
    title: 小魄罗看板娘
    details: 首页常驻的无向量 A-RAG 智能体，9 个检索与导航工具，能带着证据回答站内问题。
    link: https://blog.qianxi7988.me/
    linkText: 去和她聊聊
  - icon: 🤖
    title: 后台 AI 助手
    details: 管理端内置 54 个技能的全能助手：文章、评论、订阅、用户、论坛、AI 日报一站运维。
    link: /features/
    linkText: 看功能清单
  - icon: 🔥
    title: AI 热点日报
    details: 定时抓取热点并生成日报草稿，支持人工编辑、精选、发布与来源溯源。
    link: https://blog.qianxi7988.me/#/hotspots
    linkText: 看最新日报
  - icon: 💬
    title: 评论与论坛
    details: 评论审核 + 举报处理 + 论坛主题讨论，蜜罐与限流双防线对抗垃圾内容。
    link: /features/
    linkText: 了解详情
  - icon: ✉️
    title: 邮件订阅
    details: 读者订阅、新文章发布自动通知，管理端支持冻结、解冻与不活跃清理。
    link: https://blog.qianxi7988.me/#/subscribe
    linkText: 去订阅
  - icon: 🧠
    title: AI 问答架构
    details: 双智能体设计：访客侧无向量 A-RAG 看板娘 + 管理侧 54 技能运维助手，契约自检接进 CI。
    link: /ai-architecture
    linkText: 看架构拆解
  - icon: 🛠️
    title: 开发历程
    details: 事故驱动的架构演进：XSS 根因、静默 bug 与契约测试、手工部署到 CI/CD。
    link: /history
    linkText: 读演进故事
---
