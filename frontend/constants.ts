import { Article, Prompt, Comment } from './types';

export const ARTICLES: Article[] = [
  {
    id: 1,
    title: "深入浅出：微调 Llama 3 以处理特定垂直领域任务",
    summary: "详细介绍如何利用 QLoRA 技术在有限算力下完成 Llama 3 的指令微调，并分享数据集清洗的实用技巧。",
    category: "AI Engineering",
    date: "2024-10-24",
    readTime: "8 min",
    imageUrl: "https://picsum.photos/seed/ai1/800/400",
    tags: ["LLM", "Python", "PyTorch"]
  },
  {
    id: 2,
    title: "Transformer 注意力机制：从公式到视觉直觉",
    summary: "理解自注意力、交叉注意力以及掩码机制。通过交互式可视化帮助你直观感受 Transformer 内部的信息流动。",
    category: "Deep Learning",
    date: "2024-10-18",
    readTime: "12 min",
    imageUrl: "https://picsum.photos/seed/ai2/800/400",
    tags: ["Theory", "NLP", "Deep Learning"]
  },
  {
    id: 3,
    title: "React Server Components: 前端架构的新范式",
    summary: "RSC 到底解决了什么问题？从 Next.js App Router 出发，探讨服务端组件对数据获取和包体积的影响。",
    category: "Frontend",
    date: "2024-10-10",
    readTime: "10 min",
    imageUrl: "https://picsum.photos/seed/fe1/800/400",
    tags: ["React", "Next.js", "Frontend"]
  },
  {
    id: 4,
    title: "自主 AI 智能体：如何构建一个能自我思考的助理",
    summary: "从 AutoGPT 到最新 Agent 框架，探讨智能体如何进行任务规划、工具调用以及长短期记忆管理。",
    category: "AI Agent",
    date: "2024-09-28",
    readTime: "6 min",
    imageUrl: "https://picsum.photos/seed/ai3/800/400",
    tags: ["Agents", "Design", "LLM"]
  },
  {
    id: 5,
    title: "Rust for JavaScript Developers",
    summary: "为前端开发者准备的 Rust 入门指南，对比内存管理机制，以及如何通过 WASM 优化前端计算密集型任务。",
    category: "System",
    date: "2024-09-15",
    readTime: "15 min",
    imageUrl: "https://picsum.photos/seed/sys1/800/400",
    tags: ["Rust", "WASM", "Web"]
  }
];

export const PROMPTS: Prompt[] = [
  {
    id: 1,
    title: "代码审查专家",
    description: "作为一名资深的软件架构师，对提供的代码进行逻辑审计、安全性检查。",
    content: "你是一位资深的软件架构师，请对我提供的代码进行深度审计，重点关注安全性、性能优化和代码规范。",
    category: "Dev"
  },
  {
    id: 2,
    title: "周报自动扩写",
    description: "将零散的工作要点转化成具有职场专业度、条理清晰的周报。",
    content: "请将以下工作要点扩写成一份正式的周报，包含本周进展、下周计划和风险点，语气专业。",
    category: "Business"
  },
  {
    id: 3,
    title: "学术论文润色",
    description: "针对科技类论文进行润色，提升表达的精确性和学术性。",
    content: "请对以下学术摘要进行润色，使其符合顶级计算机期刊的投稿标准，保持原意但提升词汇丰富度。",
    category: "Academic"
  }
];

export const COMMENTS: Comment[] = [
  {
    id: 1,
    user: "FrontendFan",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
    content: "这篇文章对 Attention 机制的讲解非常透彻，特别是可视化部分！非常有帮助，希望能多出一些关于 ViT 的内容。",
    date: "2小时前",
    replies: []
  },
  {
    id: 2,
    user: "AI_Newbie",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
    content: "请问 positional encoding 的具体代码实现在哪里可以看到完整版？我在 PyTorch 官网没找到类似的实现。",
    date: "昨天",
    replies: [
      {
        id: 21,
        user: "Administrator",
        content: "可以参考 HuggingFace 的 Transformers 库源码，或者我在 GitHub 上的示例仓库 (link)。",
        date: "昨天"
      }
    ]
  }
];

export const SIDEBAR_ITEMS = [
  { label: '仪表盘', path: '/admin', icon: 'LayoutDashboard' },
  { label: '文章管理', path: '/admin/posts', icon: 'FileText' },
  { label: '评论审核', path: '/admin/comments', icon: 'MessageCircle' },
  { label: '热点管理', path: '/admin/hotspots', icon: 'TrendingUp' },
  { label: 'Prompt 管理', path: '/admin/prompts', icon: 'Bot' },
  { label: '订阅管理', path: '/admin/subscribers', icon: 'Mail' },
  { label: 'AI 助手', path: '/admin/ai-agent', icon: 'Sparkles' },
  { label: '站点设置', path: '/admin/settings', icon: 'Settings' },
];