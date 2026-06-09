import asyncio
import sys
import os
from datetime import datetime

# 将后端目录添加到路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if os.path.exists(BACKEND_DIR):
    sys.path.insert(0, BACKEND_DIR)
else:
    # 尝试当前目录就是 backend 的情况
    if os.path.exists(os.path.join(BASE_DIR, "app")):
        sys.path.insert(0, BASE_DIR)

from app.core.database import async_session_maker
from app.models.admin import Admin
from app.models.article import Article, Tag, ArticleTag
from app.models.comment import Comment
from app.models.settings import SiteSetting
from app.models.prompt import Prompt  # 必须导入以完成关系映射
from app.models.image import ArticleImage  # 必须导入以完成关系映射
from app.models.chat import ChatSession, ChatMessage  # 必须导入以完成关系映射
from app.models.stats import PageView, DailyStat  # 必须导入以完成关系映射
from sqlalchemy import select, delete
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def enrich_data():
    async with async_session_maker() as db:
        # 1. 更新管理员
        print("正在更新管理员信息...")
        result = await db.execute(select(Admin).where(Admin.username == "admin"))
        admin = result.scalar_one_or_none()
        if admin:
            admin.display_name = "千禧"
            admin.bio = "你好，我是一名专注于 AI 大模型研发与应用的从业者。我的博客会记录大模型学习路上的干货、踩坑与思考，从模型原理的深度拆解，到工程化部署的实战经验，再到前沿技术的探索与实践。希望能和同频的你一起交流成长，共同解锁 AI 大模型的无限可能。"
            admin.qq = "1964055097"
            admin.wechat = "k1964055097"
            admin.github = "https://github.com/qianxi-00"
            admin.avatar_url = "/uploads/images/d6241590da0640d68bf8cb5813f440d2.jpg"
        else:
            # 创建管理员
            admin = Admin(
                username="admin",
                password_hash=pwd_context.hash("admin123"),
                display_name="千禧",
                bio="你好，我是一名专注于 AI 大模型研发与应用的从业者。我的博客会记录大模型学习路上的干货、踩坑与思考，从模型原理的深度拆解，到工程化部署的实战经验，再到前沿技术的探索与实践。希望能和同频的你一起交流成长，共同解锁 AI 大模型的无限可能。",
                qq="1964055097",
                wechat="k1964055097",
                github="https://github.com/qianxi-00",
                avatar_url="/uploads/images/d6241590da0640d68bf8cb5813f440d2.jpg",
                role="super_admin"
            )
            db.add(admin)
        await db.flush()

        # 2. 更新站点设置
        print("正在更新站点设置...")
        settings_to_update = {
            "site_title": "千禧的个人博客",
            "site_description": "你好，我是一名专注于 AI 大模型研发与应用的从业者。我的博客会记录大模型学习路上的干货、踩坑与思考，从模型原理的深度拆解，到工程化部署的实战经验，再到前沿技术的探索与实践。希望能和同频的你一起交流成长，共同解锁 AI 大模型的无限可能。",
            "admin_avatar": "/uploads/images/d6241590da0640d68bf8cb5813f440d2.jpg",
            "admin_bio": "你好，我是一名专注于 AI 大模型研发与应用的从业者。我的博客会记录大模型学习路上的干货、踩坑与思考，从模型原理的深度拆解，到工程化部署的实战经验，再到前沿技术的探索与实践。希望能和同频的你一起交流成长，共同解锁 AI 大模型的无限可能。"
        }
        for key, value in settings_to_update.items():
            res = await db.execute(select(SiteSetting).where(SiteSetting.key == key))
            setting = res.scalar_one_or_none()
            if setting:
                setting.value = value
            else:
                db.add(SiteSetting(key=key, value=value, type="string"))

        # 3. 清理旧数据并添加丰富文章
        print("正在清理旧数据并丰富文章内容...")
        # 彻底清理以确保 ID 重新开始并应用最新逻辑
        await db.execute(delete(ArticleTag))
        await db.execute(delete(Comment))
        await db.execute(delete(Article))
        await db.execute(delete(Tag))
        
        tags_data = ["Python", "React", "前端", "Linux", "人工智能", "Docker", "架构设计", "运维"]
        tag_objects = {}
        for t_name in tags_data:
            tag = Tag(name=t_name)
            db.add(tag)
            tag_objects[t_name] = tag
        await db.flush()

        articles_data = [
            {
                "title": "深入浅出 Python 异步编程：从 asyncio 到分布式任务队列",
                "summary": "详细介绍如何利用 asyncio 技术在 Python 中实现高效的并发处理，涵盖爬虫、Web 服务及任务编排的实战案例。",
                "category": "Python",
                "content_md": """# Python 异步编程深度解析

异步编程（Asynchronous Programming）是提升 Python 应用并发性能的核心。

## 1. 为什么需要异步？
Python 的 GIL 限制了多线程在 CPU 密集型任务上的表现，但在 I/O 密集型任务（如网络请求、磁盘读写）上，`asyncio` 能够极大地提高资源利用率。

## 2. 核心代码示例
```python
import asyncio
import time

async def download_page(url):
    print(f"正在下载 {url}...")
    await asyncio.sleep(2)  # 模拟网络延迟
    return f"{url} 的内容"

async def main():
    urls = ["google.com", "github.com", "python.org"]
    # 并发执行多个任务
    results = await asyncio.gather(*(download_page(u) for u in urls))
    for res in results:
        print(f"结果: {res}")

if __name__ == "__main__":
    start = time.perf_counter()
    asyncio.run(main())
    print(f"总耗时: {time.perf_counter() - start:.2f}秒")
```

## 3. 实战配图
![Python Async](https://picsum.photos/seed/py_async/800/400)

## 4. 总结
掌握事件循环（Event Loop）和协程（Coroutine）是进阶高级开发者的必经之路。
""",
                "tags": ["Python", "架构设计"],
                "cover_image": "https://picsum.photos/seed/py_cover/800/400"
            },
            {
                "title": "2026 年前端技术展望：React 19 与 Vite 6 的工程化实践",
                "summary": "探讨 React 19 的新特性，以及如何配合 Vite 6 构建超高速的前端开发环境和极致的运行时性能。",
                "category": "前端",
                "content_md": """# 前端工程化新里程碑

React 19 带来的 `Actions`, `useActionState` 等新 API 正在改变我们处理副作用的方式。

## 技术栈推荐
- **框架**: React 19
- **构建工具**: Vite 6 (Rolldown)
- **样式**: Tailwind CSS v4
- **状态管理**: Zustand

## 目录结构最佳实践
```text
src/
  ├── api/         # 基于 Axios 的封装
  ├── components/  # 原子化组件
  ├── hooks/       # 自定义逻辑复用
  └── pages/       # 视图入口
```

![Vite React HighPerf](https://picsum.photos/seed/react19/800/400)

> “好的架构不是设计出来的，而是演化出来的。”
""",
                "tags": ["React", "前端", "架构设计"],
                "cover_image": "https://picsum.photos/seed/react_cover/800/400"
            },
            {
                "title": "Linux 服务器安全加固：从 SSH 增强到防火墙高级配置",
                "summary": "保护你的云服务器免受暴力破解和恶意扫描。本文分享一套企业级的 Linux 安全加固清单。",
                "category": "Linux",
                "content_md": """# Linux 安全防护指南

在互联网上，一台没有任何防护的服务器在数分钟内就会遭到扫描。

## 必做安全步骤
1. **禁用密码登录**: 仅允许 SSH 密钥认证。
2. **更改默认端口**: 将 22 端口改为 2222 等。
3. **配置 Fail2Ban**: 自动拉黑多次尝试失败的 IP。

```bash
# 修改 SSH 配置
sudo vi /etc/ssh/sshd_config
# 设置 PasswordAuthentication no
# 重启服务
sudo systemctl restart ssh
```

## 网络监控
通过 `netstat` 和 `iptables` 我们可以实时看到连接情况。

![Linux Security](https://picsum.photos/seed/linux_sec/800/400)
""",
                "tags": ["Linux", "Docker"],
                "cover_image": "https://picsum.photos/seed/linux_cover/800/400"
            },
            {
                "title": "零基础构建本地 RAG 知识库：DeepSeek + LangChain 实战",
                "summary": "利用大语言模型（LLM）处理你的私人文档。手把手教你如何搭建一套完全本地化的 AI 问答助手。",
                "category": "人工智能",
                "content_md": """# RAG 本地知识库搭建教程

RAG (Retrieval-Augmented Generation) 是目前解决大模型幻觉问题的最佳方案。

## 核心流程
1. **加载文档**: PDF/Markdown
2. **向量化 (Embedding)**: 将文本转为向量
3. **向量存储 (Vector DB)**: 使用 Chroma 或 FAISS
4. **检索与生成**: 找到相关内容并喂给 LLM

## Python 实现片段
```python
from langchain.vectorstores import Chroma
from langchain.embeddings import HuggingFaceEmbeddings

# 加载 Embedding 模型
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
# 创建向量数据库
vector_db = Chroma.from_documents(documents, embeddings)
# 发起提问
query = "什么是 RAG？"
results = vector_db.similarity_search(query)
```

![AI RAG Architecture](https://picsum.photos/seed/ai_rag/800/400)

未来，每个终端都将拥有属于自己的私有大脑。
""",
                "tags": ["人工智能", "Python"],
                "cover_image": "https://picsum.photos/seed/ai_cover/800/400"
            },
            {
                "title": "云原生时代的 DevOps：使用 Docker 与 GitHub Actions 实现持续集成",
                "summary": "从代码提交到自动部署，构建自动化的 CI/CD 流水线，让你的开发效率翻倍。",
                "category": "运维",
                "content_md": """# DevOps & CI/CD 实战

持续集成不仅仅是写个脚本，更是一种团队协作的文化。

## Dockerfile 优化技巧
```dockerfile
# 使用多阶段构建减小镜像体积
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 自动化流程可视化
![CI/CD Pipeline](https://picsum.photos/seed/devops/800/400)

通过 GitHub Actions，每一次 `push` 都能触发自动测试和部署。
""",
                "tags": ["Docker", "Linux", "架构设计"],
                "cover_image": "https://picsum.photos/seed/devops_cover/800/400"
            }
        ]

        for a_data in articles_data:
            article = Article(
                title=a_data["title"],
                summary=a_data["summary"],
                category=a_data["category"],
                content_md=a_data["content_md"],
                content_html=None,  # 设置为 None 以触发前端 ReactMarkdown 渲染
                author_id=admin.id,
                status="published",
                published_at=datetime.now(),
                cover_image=a_data["cover_image"],
                view_count=100 + a_data.get("id", 0) * 5
            )
            for t_name in a_data["tags"]:
                article.tags.append(tag_objects[t_name])
            db.add(article)
            await db.flush()

            # 4. 添加评论
            comments = [
                {"nickname": "张三", "content": "内容很干，实操性很强！"},
                {"nickname": "李四", "content": "感谢分享，正愁不知道怎么配置呢。"},
                {"nickname": "技术萌新", "content": "请问文中提到的库在哪里下载？"}
            ]
            for c_data in comments:
                comment = Comment(
                    article_id=article.id,
                    nickname=c_data["nickname"],
                    content=c_data["content"],
                    status="approved",
                    created_at=datetime.now()
                )
                db.add(comment)
            
            # 管理员回复一条
            admin_reply = Comment(
                article_id=article.id,
                nickname="千禧",
                content="感谢点赞，有问题可以随时在群里交流。",
                status="approved",
                is_admin_reply=True,
                admin_id=admin.id,
                created_at=datetime.now()
            )
            db.add(admin_reply)

        # 5. 丰富提示词内容
        print("正在丰富提示词内容...")
        await db.execute(delete(Prompt))
        
        prompts_data = [
            {
                "title": "🔍 高级代码审查助手",
                "description": "帮助你进行深入的代码审查，发现潜在问题和优化点",
                "content": """你是一位拥有 15 年经验的资深软件架构师和代码审查专家。请按照以下维度对代码进行全面审查：

## 审查维度

### 1. 代码质量
- 命名规范是否清晰
- 函数/方法是否遵循单一职责原则
- 是否有代码重复

### 2. 性能分析
- 是否存在 N+1 查询问题
- 循环内是否有不必要的计算
- 内存使用是否合理

### 3. 安全检查
- 是否有 SQL 注入风险
- 是否有 XSS 漏洞
- 敏感数据处理是否安全

### 4. 最佳实践
- 错误处理是否完善
- 日志记录是否充分
- 是否有适当的注释

## 输出格式
对每个发现的问题，请提供：
1. 问题描述
2. 严重程度（高/中/低）
3. 建议的修复方案
4. 修复后的代码示例

请审查以下代码：
```
[粘贴代码]
```""",
                "category": "Dev"
            },
            {
                "title": "🐍 Python Debug 专家",
                "description": "专业分析和修复 Python 代码中的 Bug",
                "content": """你是一位 Python 调试专家。我会提供有问题的代码和错误信息，请帮我：

## 分析步骤
1. **定位问题**：分析错误堆栈，找出根本原因
2. **解释原理**：说明为什么会产生这个错误
3. **提供修复**：给出正确的代码实现
4. **预防建议**：如何避免类似问题

## 常见问题类型
- ImportError / ModuleNotFoundError
- TypeError / AttributeError
- IndexError / KeyError
- asyncio 相关问题
- 内存泄漏

## 请提供
- 完整的错误信息
- 相关代码片段
- Python 版本
- 使用的第三方库

---
我的代码和错误信息：
```python
[粘贴代码]
```

错误信息：
```
[粘贴错误]
```""",
                "category": "Dev"
            },
            {
                "title": "📝 技术博客写作助手",
                "description": "帮助撰写高质量的技术博客文章",
                "content": """你是一位专业的技术内容创作者，擅长将复杂的技术概念用通俗易懂的方式表达。

## 写作风格
- 开篇吸引人，点明文章价值
- 循序渐进，由浅入深
- 配合代码示例和图表
- 结尾有总结和延伸阅读

## 文章结构模板
```markdown
# 标题（吸引眼球）

## 引言
- 为什么要了解这个主题
- 读完能收获什么

## 背景知识（如需）
- 前置概念解释

## 核心内容
### 概念讲解
### 代码实战
### 踩坑经验

## 最佳实践 / 注意事项

## 总结
- 核心要点回顾
- 进一步学习资源
```

## 我的主题
请帮我写一篇关于 [主题] 的技术博客：
- 目标读者：[初级/中级/高级开发者]
- 预期字数：[800-1500字]
- 需要强调：[具体要点]""",
                "category": "Writing"
            },
            {
                "title": "🗄️ SQL 大师",
                "description": "将自然语言需求转换为优化的 SQL 查询",
                "content": """你是一位数据库专家，精通 MySQL、PostgreSQL、SQLite 等主流数据库。

## 我需要你
1. **理解需求**：将自然语言描述转为精确的 SQL
2. **优化查询**：提供性能最优的写法
3. **解释逻辑**：注释说明每一步的作用

## 请提供
- 数据库类型（MySQL/PostgreSQL/SQLite）
- 表结构（如有）
- 你的数据需求

## 输出格式
```sql
-- 需求说明：xxx
-- 优化说明：xxx

SELECT ...
FROM ...
```

## 示例
需求："查询最近7天每天的订单数量和总金额，按日期降序"
表：orders(id, user_id, amount, created_at)

---
我的需求：
[描述你的数据需求]

表结构：
[粘贴表结构或描述字段]""",
                "category": "Dev"
            },
            {
                "title": "📋 Git Commit 规范生成器",
                "description": "根据代码变更自动生成规范的 Commit Message",
                "content": """你是一个 Git Commit Message 生成专家，遵循 Conventional Commits 规范。

## Commit 类型
- `feat`: 新功能
- `fix`: 修复 Bug
- `docs`: 文档更新
- `style`: 代码格式（不影响运行）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具变动

## 格式规范
```
<type>(<scope>): <subject>

<body>

<footer>
```

## 规则
1. subject 不超过 50 字符
2. 使用祈使句（Add 而非 Added）
3. body 说明 what & why
4. 有 breaking change 需在 footer 标注

## 输入你的变更
请描述你做了什么修改：
[描述代码变更内容]

涉及的模块/文件：
[列出相关模块]""",
                "category": "Dev"
            },
            {
                "title": "🔤 正则表达式专家",
                "description": "生成、解释和调试正则表达式",
                "content": """你是一位正则表达式专家。我可能会：
1. 给你一个需求，请生成正则
2. 给你一个正则，请解释含义
3. 给你一个正则和测试用例，帮我调试

## 生成正则时
- 提供多种语言的写法（Python、JavaScript、Go）
- 解释每一部分的含义
- 给出测试用例

## 解释正则时
- 逐字符分析
- 画出匹配流程
- 举例说明匹配和不匹配的情况

## 示例输出格式
```
正则：/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

解析：
^                    - 字符串开始
[a-zA-Z0-9._%+-]+   - 邮箱用户名部分
@                    - @ 符号
[a-zA-Z0-9.-]+      - 域名部分
\.                   - 点号
[a-zA-Z]{2,}        - 顶级域名（至少2位）
$                    - 字符串结束

测试：
✅ test@example.com
✅ user.name+tag@domain.co.uk
❌ @nodomain.com
❌ missing@.com
```

---
我的需求：
[描述你需要匹配的内容 或 粘贴需要解释的正则]""",
                "category": "Dev"
            },
            {
                "title": "📄 学术论文润色助手",
                "description": "帮助润色英文学术论文，提升表达质量",
                "content": """你是一位专业的学术英语编辑，精通计算机科学领域的学术写作规范。

## 润色原则
1. **准确性**：保持原意，不改变技术表述
2. **学术性**：使用正式、客观的学术语言
3. **简洁性**：删除冗余，提高信息密度
4. **流畅性**：改善句子结构和段落连贯

## 我需要你
- 修正语法和拼写错误
- 优化句子结构
- 使用更精确的学术词汇
- 提供修改理由

## 输出格式
对每处修改，请展示：
1. 原文
2. 修改后
3. 修改理由

## 论文类型
请选择：
- [ ] Abstract
- [ ] Introduction
- [ ] Related Work
- [ ] Methodology
- [ ] Experiments
- [ ] Conclusion

---
请润色以下内容：
[粘贴英文段落]""",
                "category": "Academic"
            },
            {
                "title": "🎨 React 组件设计师",
                "description": "帮助设计和实现高质量的 React 组件",
                "content": """你是一位 React 前端架构师，精通 React 18、TypeScript 和现代 CSS。

## 组件设计原则
1. **单一职责**：一个组件只做一件事
2. **可复用性**：通过 props 提供灵活配置
3. **类型安全**：完整的 TypeScript 类型定义
4. **无障碍性**：遵循 WCAG 2.1 标准

## 技术栈
- React 18 + TypeScript
- Tailwind CSS
- 状态管理：React Context / Zustand
- 动画：Framer Motion

## 请提供
1. 组件功能描述
2. 期望的 Props 接口
3. 是否需要状态管理
4. 样式偏好（简约/华丽）

## 输出内容
1. 完整的 TypeScript 组件代码
2. Props 类型定义
3. 使用示例
4. 单元测试建议

---
我需要的组件：
[描述组件功能和需求]""",
                "category": "Dev"
            },
            {
                "title": "🐳 Docker 部署顾问",
                "description": "帮助编写优化的 Dockerfile 和 docker-compose 配置",
                "content": """你是一位 Docker 和容器化部署专家。

## 我可以帮你
1. 编写生产级 Dockerfile
2. 配置 docker-compose
3. 优化镜像体积
4. 排查容器问题

## Dockerfile 最佳实践
- 使用多阶段构建
- 选择合适的基础镜像
- 合理利用缓存层
- 非 root 用户运行
- 健康检查配置

## 请告诉我
- 应用类型（Node.js/Python/Go/Java）
- 是否需要 nginx 反代
- 是否需要数据库
- 部署环境（开发/生产）

## 输出内容
1. Dockerfile（带详细注释）
2. docker-compose.yml（如需）
3. .dockerignore
4. 启动命令说明

---
我的项目：
[描述你的应用和部署需求]""",
                "category": "Dev"
            },
            {
                "title": "📊 数据可视化顾问",
                "description": "帮助选择和实现合适的数据可视化方案",
                "content": """你是一位数据可视化专家，精通 ECharts、D3.js、Chart.js 等库。

## 图表选择指南
| 数据类型 | 推荐图表 |
|---------|---------|
| 趋势变化 | 折线图、面积图 |
| 对比分析 | 柱状图、条形图 |
| 占比分布 | 饼图、环形图 |
| 关系网络 | 关系图、桑基图 |
| 地理数据 | 地图、热力图 |

## 请提供
1. 你的数据结构
2. 想要展示的信息
3. 目标受众
4. 技术栈偏好

## 我将提供
1. 最佳图表类型建议
2. 完整的代码实现
3. 交互效果建议
4. 性能优化建议

---
我的数据和需求：
[描述数据格式和可视化目标]""",
                "category": "Dev"
            }
        ]
        
        for p_data in prompts_data:
            prompt = Prompt(
                title=p_data["title"],
                description=p_data["description"],
                content=p_data["content"],
                category=p_data["category"],
                author_id=admin.id,
                status="approved",
                created_at=datetime.now()
            )
            db.add(prompt)

        await db.commit()
        print("✅ 数据库内容丰富完成！")
        print("  - 管理员信息已更新")
        print("  - 站点设置已更新")
        print(f"  - 已添加 {len(articles_data)} 篇丰富内容的文章")
        print(f"  - 已添加 {len(prompts_data)} 个高质量提示词")

if __name__ == "__main__":
    asyncio.run(enrich_data())
