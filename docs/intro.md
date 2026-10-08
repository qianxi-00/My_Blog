# 项目介绍

**DevLog / My_Blog** 是一个面向 AI 技术内容创作与运营的现代化全栈博客系统，由 [千禧](https://blog.qianxi7988.me) 开发与维护，线上地址：<https://blog.qianxi7988.me>。

它不只是「写文章的地方」——围绕个人内容运营，逐步长出了 AI 看板娘、后台 AI 运维助手、热点日报、订阅通知、论坛讨论等一整套能力。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 后端 | FastAPI + SQLAlchemy 2.0 (async) | Python 异步 API，145+ 个 REST 端点 |
| 数据库 | SQLite + WAL | 单文件零运维，`busy_timeout` 与两 worker 压力下表现稳定 |
| 前端 | React 19 + TypeScript + Vite 6 | 按需分包，路由级懒加载 |
| 样式 | Tailwind CSS | 运行时 JIT |
| AI | LangChain / OpenAI 兼容接口 | 看板娘 A-RAG 与后台助手共用模型层 |
| 部署 | Docker + Nginx | 容器化交付，静态资源由 Nginx 直接供出，gzip 压缩 |

## 项目结构

```
My_Blog/
├── backend/              # FastAPI 应用
│   ├── app/api/v1/       # 路由层（articles / comments / hotspots / forum / agent …）
│   ├── app/services/     # 业务层（含 arag_agent 看板娘、agent 后台技能系统）
│   ├── app/core/         # 配置、数据库、安全、提示词
│   └── scripts/          # 技能自检等维护脚本
├── frontend/             # React SPA
│   ├── pages/            # 文章 / 热点 / 论坛 / 管理后台 / AI 助手工作台
│   └── components/       # Markdown 渲染器、看板娘 DesktopPet 等
├── docs/                 # 本文档站（VitePress）
└── scripts/              # 部署与运维脚本
```

## 内容渲染

文章正文渲染是自研的一套 Markdown 管线，支持：

- GFM 表格、删除线、任务列表
- LaTeX 数学公式（行内 `$` 与块级 `$$`）
- Mermaid 图表
- 代码语法高亮 + 一键复制 + 语言标签
- XMind 思维导图嵌入
- 内嵌视频 / 音频

安全边界：所有用户可提交内容（评论、论坛、聊天、提示词）渲染时**默认禁用原始 HTML** 并过 `rehype-sanitize` 消毒，只有作者本人写的文章正文才允许受控的富媒体嵌入。

## 相关链接

- 线上博客：<https://blog.qianxi7988.me>
- GitHub 仓库：<https://github.com/qianxi-00/My_Blog>
- [功能特性](/features) · [部署指南](/deploy)
