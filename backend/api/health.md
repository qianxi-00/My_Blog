# DevLog 后端接口文档（FastAPI）

> 文档来源：根据仓库中 FastAPI 路由与 Pydantic Schema **真实提取**生成，可直接用于前端/第三方对接。
>
> - API 版本前缀：`/api/v1`（见 `backend/app/main.py:87-89`）
> - 健康检查：`/health`（不在 `/api/v1` 下，见 `backend/app/main.py:106-109`）
> - 路由聚合：`backend/app/api/v1/router.py`
>
---

## 1. 基础信息

### 1.1 Base URL

- 本地开发（默认）：`http://127.0.0.1:8000`
- 接口前缀：`/api/v1`

最终示例：`http://127.0.0.1:8000/api/v1/articles`

### 1.2 统一响应风格

本项目同时存在两类返回风格：

1) **分页列表**普遍使用 `PaginatedResponse[T]`（见 `backend/app/schemas/common.py:23-30`）

```json
{
  "success": true,
  "message": "操作成功",
  "data": [],
  "total": 0,
  "page": 1,
  "page_size": 10,
  "total_pages": 0
}
```

2) 许多接口直接返回 **裸对象/裸数组/`{message: ...}`**，未统一包装（例如 `auth/logout`、删除类接口等）。文档已按代码真实返回结构描述。

### 1.3 静态文件（上传文件）访问

- 静态挂载：`/uploads`（见 `backend/app/main.py:90-94`）
- 上传图片接口返回的 `url` 多为形如：`/uploads/images/<uuid>.<ext>`

---

## 2. 鉴权说明（管理员 JWT）

> 依赖实现：`backend/app/core/deps.py`

### 2.1 认证方式

需要管理员鉴权的接口：

- 请求头：`Authorization: Bearer <access_token>`
- 认证方案：HTTP Bearer（`HTTPBearer(auto_error=False)`）

### 2.2 权限级别

- **管理员（admin）**：满足 `get_current_admin`
- **超级管理员（super_admin）**：满足 `get_super_admin`（在 `get_current_admin` 基础上要求 `admin.role == "super_admin"`）

### 2.3 鉴权失败错误码（依赖层抛出）

- `401 Unauthorized`
  - 未提供认证凭证：`detail="未提供认证凭证"`
  - 无效的认证令牌：`detail="无效的认证令牌"`
  - 无效的令牌内容：`detail="无效的令牌内容"`
  - 管理员不存在：`detail="管理员不存在"`
  - 通常会带 `WWW-Authenticate: Bearer`
- `403 Forbidden`
  - 账号已被禁用：`detail="账号已被禁用"`
  - 需要超级管理员权限：`detail="需要超级管理员权限"`

---

## 3. 分页约定

出现分页的列表接口，一般使用以下 query 参数（各接口默认值略有差异，以接口条目为准）：

- `page`：页码，从 1 开始
- `page_size`：每页条数

并以 `PaginatedResponse[T]` 形式返回：`data/total/page/page_size/total_pages`。

---

## 4. 健康检查（Health）

### 4.1 健康检查

- **用途**：用于探活/监控
- **URL**：`/health`
- **Method**：`GET`
- **鉴权**：无
- **参数**：无
- **实现文件**：`backend/app/main.py:106-109`

示例请求：
```bash
curl -X GET "http://127.0.0.1:8000/health"
```

示例响应：
```json
{"status":"healthy"}
```

错误码：
- 通常无业务错误码（框架异常可能为 `500`）

---

## 5. 认证（Auth）`/api/v1/auth`

> 路由文件：`backend/app/api/v1/auth.py`
>
> 相关 Schema：`backend/app/schemas/admin.py`

### 5.1 管理员登录

- **用途**：管理员使用用户名/密码登录，获取 JWT
- **URL**：`/api/v1/auth/login`
- **Method**：`POST`
- **鉴权**：无
- **实现**：`backend/app/api/v1/auth.py`（约 27-73 行）
- **请求体 Schema**：`AdminLogin`（`backend/app/schemas/admin.py:61-65`）

参数表（Body JSON）：
| 字段 | 类型 | 必填 | 约束 | 说明 |
|---|---|---:|---|---|
| username | string | 是 | - | 用户名 |
| password | string | 是 | - | 密码 |

示例请求：
```bash
curl -X POST "http://127.0.0.1:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
```

- **响应体 Schema**：`AdminLoginResponse`（`backend/app/schemas/admin.py:67-73`）

示例响应：
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 3600,
  "admin": {
    "username": "admin",
    "email": "admin@example.com",
    "display_name": "管理员",
    "avatar_url": null,
    "bio": null,
    "qq": null,
    "wechat": null,
    "github": null,
    "bilibili": null,
    "id": 1,
    "role": "super_admin",
    "is_active": true,
    "created_at": "2026-03-14T00:00:00",
    "updated_at": null
  }
}
```

错误码：
- `401 Unauthorized`：用户名或密码错误（`detail="用户名或密码错误"`）
- `403 Forbidden`：账号已被禁用（`detail="账号已被禁用"`）

---

### 5.2 退出登录

- **用途**：提示客户端删除 Token（JWT 无状态）
- **URL**：`/api/v1/auth/logout`
- **Method**：`POST`
- **鉴权**：需要管理员（`get_current_admin`）
- **实现**：`backend/app/api/v1/auth.py`（约 76-85 行）

参数：无

示例请求：
```bash
curl -X POST "http://127.0.0.1:8000/api/v1/auth/logout" \
  -H "Authorization: Bearer <jwt>"
```

示例响应：
```json
{"message":"退出成功"}
```

错误码：
- `401/403`：鉴权失败（见“鉴权说明”）

---

### 5.3 获取当前登录管理员信息

- **用途**：获取当前管理员资料
- **URL**：`/api/v1/auth/me`
- **Method**：`GET`
- **鉴权**：需要管理员
- **实现**：`backend/app/api/v1/auth.py`（约 88-95 行）
- **响应 Schema**：`AdminResponse`（`backend/app/schemas/admin.py:49-59`）

示例请求：
```bash
curl -X GET "http://127.0.0.1:8000/api/v1/auth/me" \
  -H "Authorization: Bearer <jwt>"
```

示例响应：见 `AdminResponse` 字段（与登录返回的 `admin` 一致）。

错误码：
- `401/403`：鉴权失败

---

### 5.4 更新个人资料

- **用途**：更新当前管理员的资料字段
- **URL**：`/api/v1/auth/me`
- **Method**：`PUT`
- **鉴权**：需要管理员
- **实现**：`backend/app/api/v1/auth.py`（约 98-125 行）
- **请求体 Schema**：`AdminUpdate`（`backend/app/schemas/admin.py:30-41`）
- **响应体 Schema**：`AdminResponse`

参数表（Body JSON）：
| 字段 | 类型 | 必填 | 约束 | 说明 |
|---|---|---:|---|---|
| email | string(email) | 否 | - | 邮箱 |
| display_name | string | 否 | max_length=100 | 显示名称 |
| avatar_url | string | 否 | max_length=500 | 头像 URL |
| bio | string | 否 | - | 简介 |
| qq | string | 否 | max_length=20 | QQ |
| wechat | string | 否 | max_length=50 | 微信 |
| github | string | 否 | max_length=100 | GitHub |
| bilibili | string | 否 | max_length=100 | Bilibili |
| is_active | boolean | 否 | - | 是否启用（对本接口实际是否生效取决于后端逻辑；建议前端不要提交） |

示例请求：
```bash
curl -X PUT "http://127.0.0.1:8000/api/v1/auth/me" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"新昵称","github":"https://github.com/xxx"}'
```

示例响应：`AdminResponse`。

错误码：
- `400 Bad Request`：邮箱已被使用（`detail="该邮箱已被使用"`）
- `401/403`：鉴权失败

---

### 5.5 修改自己的密码

- **用途**：修改当前管理员密码
- **URL**：`/api/v1/auth/password`
- **Method**：`PUT`
- **鉴权**：需要管理员
- **实现**：`backend/app/api/v1/auth.py`（约 128-162 行）
- **请求体 Schema**：`AdminPasswordUpdate`（`backend/app/schemas/admin.py:43-47`）

参数表（Body JSON）：
| 字段 | 类型 | 必填 | 约束 | 说明 |
|---|---|---:|---|---|
| old_password | string | 否 | - | 旧密码（Schema 描述：超级管理员可不填） |
| new_password | string | 是 | 6~100 | 新密码 |

示例请求：
```bash
curl -X PUT "http://127.0.0.1:8000/api/v1/auth/password" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"old_password":"old","new_password":"new_password"}'
```

示例响应：
```json
{"message":"密码修改成功"}
```

错误码：
- `400 Bad Request`：旧密码错误（`detail="旧密码错误"`）
- `401/403`：鉴权失败

---

## 6. 管理员（Admins）`/api/v1/admins`

> 路由文件：`backend/app/api/v1/admins.py`
>
> 相关 Schema：`backend/app/schemas/admin.py`

### 6.1 获取管理员列表（仅超管）

- **用途**：获取所有管理员列表
- **URL**：`/api/v1/admins`
- **Method**：`GET`
- **鉴权**：需要超级管理员（`get_super_admin`）
- **实现**：`backend/app/api/v1/admins.py`（约 23-33 行）
- **响应 Schema**：`AdminResponse[]`

示例请求：
```bash
curl -X GET "http://127.0.0.1:8000/api/v1/admins" \
  -H "Authorization: Bearer <jwt>"
```

错误码：
- `401/403`：鉴权失败

---

### 6.2 创建管理员（仅超管）

- **用途**：创建新管理员账号
- **URL**：`/api/v1/admins`
- **Method**：`POST`
- **鉴权**：需要超级管理员
- **实现**：`backend/app/api/v1/admins.py`（约 36-82 行）
- **请求体 Schema**：`AdminCreate`（`backend/app/schemas/admin.py:24-28`）
- **响应体 Schema**：`AdminResponse`

参数表（Body JSON）：
| 字段 | 类型 | 必填 | 约束 | 说明 |
|---|---|---:|---|---|
| username | string | 是 | 3~50 | 用户名 |
| email | string(email) | 否 | - | 邮箱 |
| display_name | string | 否 | max_length=100 | 显示名称 |
| avatar_url | string | 否 | max_length=500 | 头像 URL |
| bio | string | 否 | - | 简介 |
| qq | string | 否 | max_length=20 | QQ |
| wechat | string | 否 | max_length=50 | 微信 |
| github | string | 否 | max_length=100 | GitHub |
| bilibili | string | 否 | max_length=100 | Bilibili |
| password | string | 是 | 6~100 | 密码 |
| role | string | 否 | 默认 admin | 角色：`super_admin` 或 `admin` |

错误码：
- `400`：用户名已存在（`detail="用户名已存在"`）
- `400`：邮箱已被使用（`detail="邮箱已被使用"`）
- `401/403`

---

### 6.3 获取管理员详情（仅超管）

- **用途**：按 ID 获取管理员详情
- **URL**：`/api/v1/admins/{admin_id}`
- **Method**：`GET`
- **鉴权**：需要超级管理员
- **Path 参数**：`admin_id: int`
- **实现**：`backend/app/api/v1/admins.py`（约 84-103 行）
- **响应**：`AdminResponse`

错误码：
- `404`：管理员不存在（`detail="管理员不存在"`）
- `401/403`

---

### 6.4 更新管理员信息（超管或本人）

- **用途**：更新指定管理员资料
- **URL**：`/api/v1/admins/{admin_id}`
- **Method**：`PUT`
- **鉴权**：需要管理员（`get_current_admin`），并在代码内二次鉴权
- **Path 参数**：`admin_id: int`
- **请求体**：`AdminUpdate`
- **实现**：`backend/app/api/v1/admins.py`（约 105-145 行）

权限规则（代码逻辑）：
- 非超管且不是本人：`403 detail="权限不足"`
- 非超管提交 `is_active` 会被服务端忽略

错误码：
- `403`：权限不足
- `404`：管理员不存在
- `401/403`

---

### 6.5 删除管理员（仅超管）

- **用途**：删除管理员（禁止删除自己）
- **URL**：`/api/v1/admins/{admin_id}`
- **Method**：`DELETE`
- **鉴权**：需要超级管理员
- **实现**：`backend/app/api/v1/admins.py`（约 147-176 行）

示例响应：
```json
{"message":"删除成功"}
```

错误码：
- `400`：不能删除自己（`detail="不能删除自己"`）
- `404`：管理员不存在
- `401/403`

---

### 6.6 修改管理员密码（超管或本人）

- **用途**：修改指定管理员密码
- **URL**：`/api/v1/admins/{admin_id}/password`
- **Method**：`PUT`
- **鉴权**：需要管理员，并在代码内二次鉴权
- **Path 参数**：`admin_id: int`
- **请求体**：`AdminPasswordUpdate`
- **实现**：`backend/app/api/v1/admins.py`（约 178-221 行）

权限规则（代码逻辑）：
- 非超管且不是本人：`403 detail="权限不足"`
- 非超管必须提供 `old_password`，否则 `400 detail="请提供旧密码"`
- 非超管提供 `old_password` 但校验失败：`400 detail="旧密码错误"`

示例响应：
```json
{"message":"密码修改成功"}
```

错误码：
- `400/403/404/401`

---

## 7. 文章（Articles）`/api/v1/articles`

> 路由文件：`backend/app/api/v1/articles.py`
>
> 相关 Schema：
> - `backend/app/schemas/article.py`
> - 分页：`backend/app/schemas/common.py`

### 7.1 获取文章列表（分页）

- **用途**：分页获取文章列表（游客仅已发布；管理员可见全部）
- **URL**：`/api/v1/articles`
- **Method**：`GET`
- **鉴权**：可选管理员（`get_current_admin_optional`）
- **响应**：`PaginatedResponse[ArticleListResponse]`
- **实现**：`backend/app/api/v1/articles.py`

Query 参数：
| 参数 | 类型 | 必填 | 默认 | 约束 | 说明 |
|---|---|---:|---|---|---|
| page | int | 否 | 1 | ge=1 | 页码 |
| page_size | int | 否 | 10 | 1~100 | 每页条数 |
| category | string | 否 | - | - | 分类过滤 |
| tag | string | 否 | - | - | 标签名过滤 |
| status | string | 否 | - | - | 文章状态过滤（仅管理员生效；对外参数名为 `status`） |
| search | string | 否 | - | - | 搜索（title/summary 模糊匹配） |
| sort_by | string | 否 | time | - | `time/views/likes` |
| sort_order | string | 否 | desc | - | `desc/asc` |

示例请求：
```bash
curl -X GET "http://127.0.0.1:8000/api/v1/articles?page=1&page_size=10&sort_by=time&sort_order=desc"
```

示例响应（结构示例，字段以 Schema 为准）：
```json
{
  "success": true,
  "message": "操作成功",
  "data": [
    {
      "id": 1,
      "title": "标题",
      "slug": "hello-world",
      "summary": "摘要",
      "cover_image": null,
      "category": "后端",
      "author": {"id": 1, "username": "admin", "display_name": null, "avatar_url": null, "bio": null, "qq": null, "wechat": null, "github": null, "bilibili": null, "email": null},
      "tags": [{"name": "Python", "color": "#000000", "id": 1, "slug": "python", "created_at": "2026-03-14T00:00:00"}],
      "status": "published",
      "is_pinned": false,
      "published_at": "2026-03-14T00:00:00",
      "read_time_minutes": 3,
      "view_count": 10,
      "like_count": 2,
      "comment_count": 1,
      "created_at": "2026-03-14T00:00:00"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10,
  "total_pages": 1
}
```

错误码：
- `422`：参数校验失败

---

### 7.2 获取所有标签（仅包含至少一篇已发布文章的标签）

- **URL**：`/api/v1/articles/tags`
- **Method**：`GET`
- **鉴权**：无
- **响应 Schema**：`TagResponse[]`（`backend/app/schemas/article.py:22-29`）
- **实现**：`backend/app/api/v1/articles.py`

---

### 7.3 获取分类及文章数

- **URL**：`/api/v1/articles/categories`
- **Method**：`GET`
- **鉴权**：无
- **响应 Schema**：`CategoryCount[]`（`backend/app/schemas/article.py:159-163`）

---

### 7.4 获取归档（按年月分组）

- **URL**：`/api/v1/articles/archives`
- **Method**：`GET`
- **鉴权**：无
- **响应 Schema**：`ArchiveGroup[]`（`backend/app/schemas/article.py:152-157`）

---

### 7.5 获取系列文章（某分类下）

- **URL**：`/api/v1/articles/series/{category}`
- **Method**：`GET`
- **鉴权**：无
- **Path 参数**：`category: string`
- **响应 Schema**：`ArticleSeriesItem[]`（`backend/app/schemas/article.py:143-150`）

---

### 7.6 获取文章详情

- **URL**：`/api/v1/articles/{article_id}`
- **Method**：`GET`
- **鉴权**：可选管理员
- **Path 参数**：`article_id: int`
- **响应 Schema**：`ArticleResponse`（`backend/app/schemas/article.py:85-110`）

行为要点（影响前端逻辑）：
- 未登录时若文章不是 `published`，返回 `404 detail="文章不存在"`
- 已发布文章访问会 `view_count += 1`

错误码：
- `404`：文章不存在
- `422`

---

### 7.7 点赞/取消点赞文章

- **URL**：`/api/v1/articles/{article_id}/like`
- **Method**：`POST`
- **鉴权**：无
- **响应**：裸 JSON（非 response_model）

响应示例：
```json
{"message":"点赞成功","like_count":11,"liked":true}
```
或
```json
{"message":"已取消点赞","like_count":10,"liked":false}
```

错误码：
- `404`：文章不存在（仅允许对已发布文章点赞）
- `422`

---

### 7.8 获取文章点赞状态

- **URL**：`/api/v1/articles/{article_id}/like-status`
- **Method**：`GET`
- **鉴权**：无
- **响应**：`{"liked": bool, "like_count": int}`

待确认点：代码未显式校验文章是否存在；文章不存在时可能返回 `like_count=0`（需以后端实现为准）。

---

### 7.9 创建文章

- **URL**：`/api/v1/articles`
- **Method**：`POST`
- **鉴权**：需要管理员
- **请求体 Schema**：`ArticleCreate`（`backend/app/schemas/article.py:41-46`）
- **响应体 Schema**：`ArticleResponse`

请求体字段（Body JSON）：
| 字段 | 类型 | 必填 | 约束 | 说明 |
|---|---|---:|---|---|
| title | string | 是 | 1~200 | 标题 |
| summary | string | 否 | - | 摘要 |
| content_md | string | 是 | - | Markdown 内容 |
| cover_image | string | 否 | max_length=500 | 封面图 |
| category | string | 否 | max_length=50 | 分类 |
| tags | string[] | 否 | 默认 [] | 标签名数组 |
| status | string | 否 | 默认 draft | `draft/published/scheduled` |
| is_pinned | boolean | 否 | 默认 false | 是否置顶 |
| scheduled_at | string(datetime) | 否 | - | 定时发布时间 |

错误码：
- `401/403/422`

---

### 7.10 更新文章（作者或超管）

- **URL**：`/api/v1/articles/{article_id}`
- **Method**：`PUT`
- **鉴权**：需要管理员
- **请求体 Schema**：`ArticleUpdate`（`backend/app/schemas/article.py:48-62`）
- **响应体 Schema**：`ArticleResponse`

错误码：
- `404`：文章不存在
- `403`：权限不足
- `401/403/422`

---

### 7.11 删除文章（作者或超管）

- **URL**：`/api/v1/articles/{article_id}`
- **Method**：`DELETE`
- **鉴权**：需要管理员
- **响应**：`{"message":"删除成功"}`

错误码：
- `404/403/401/422`

---

### 7.12 发布文章（立即/定时）

- **URL**：`/api/v1/articles/{article_id}/publish`
- **Method**：`POST`
- **鉴权**：需要管理员
- **请求体 Schema**：`ArticlePublish`（`backend/app/schemas/article.py:64-67`）
- **响应体 Schema**：`ArticleResponse`

错误码：
- `404/403/401/422`

---

### 7.13 上传 Markdown 文件创建文章（草稿）

- **URL**：`/api/v1/articles/upload-markdown`
- **Method**：`POST`
- **鉴权**：需要管理员
- **请求**：`multipart/form-data`
  - 字段：`file`（必须，且文件名以 `.md` 结尾）

错误码：
- `400`：请上传 .md 文件（`detail="请上传 .md 文件"`）
- `401/403/422`

---

### 7.14 使用大模型生成摘要

- **URL**：`/api/v1/articles/generate-summary`
- **Method**：`POST`
- **鉴权**：需要管理员
- **请求体 Schema**：`SummaryGenerateRequest`（`backend/app/schemas/article.py:165-168`）
- **响应体 Schema**：`SummaryGenerateResponse`（`backend/app/schemas/article.py:170-173`）

错误码：
- `500`：摘要生成失败
- `401/403/422`

---

### 7.15 重新计算阅读时间（维护）

- **URL**：`/api/v1/articles/fix-read-time`
- **Method**：`POST`
- **鉴权**：需要管理员（装饰器依赖声明）
- **响应**：`{ "message": str, "updated": string[] }`

---

## 8. 评论（Comments）`/api/v1/comments`

> 路由文件：`backend/app/api/v1/comments.py`
>
> 相关 Schema：`backend/app/schemas/comment.py`

### 8.1 获取文章评论（仅已审核）

- **URL**：`/api/v1/comments/article/{article_id}`
- **Method**：`GET`
- **鉴权**：无
- **响应 Schema**：`CommentListResponse`（`backend/app/schemas/comment.py:59-63`）

错误码：
- `404`：文章不存在
- `422`

---

### 8.2 提交评论

- **URL**：`/api/v1/comments/article/{article_id}`
- **Method**：`POST`
- **鉴权**：无
- **请求体 Schema**：`CommentCreate`（`backend/app/schemas/comment.py:18-21`）
- **响应 Schema**：`CommentResponse`（`backend/app/schemas/comment.py:39-57`）

错误码：
- `404`：文章不存在（包含未发布文章）
- `400`：父评论不存在（`detail="父评论不存在"`）
- `422`

---

### 8.3 点赞/取消点赞评论

- **URL**：`/api/v1/comments/{comment_id}/like`
- **Method**：`POST`
- **鉴权**：无
- **响应**：`{"message": str, "like_count": int, "liked": bool}`

错误码：
- `404`：评论不存在
- `422`

---

### 8.4 获取评论点赞状态

- **URL**：`/api/v1/comments/{comment_id}/like-status`
- **Method**：`GET`
- **鉴权**：无
- **响应**：`{"liked": bool}`

---

### 8.5 举报评论

- **URL**：`/api/v1/comments/{comment_id}/report`
- **Method**：`POST`
- **鉴权**：无
- **请求体 Schema**：`CommentReportRequest`（`backend/app/schemas/comment.py:33-37`）

错误码：
- `404`：评论不存在
- `400`：您已经举报过该评论
- `422`

---

### 8.6 管理端：待审核/举报/通过列表等

> 以下接口均需管理员鉴权（`get_current_admin`）

- `GET /api/v1/comments/pending` → `CommentPendingResponse[]`
- `GET /api/v1/comments/reported` → `ReportedCommentResponse[]`
- `GET /api/v1/comments/approved` → `CommentPendingResponse[]`
- `PUT /api/v1/comments/{comment_id}/approve` → `{message:"审核通过"}`
- `PUT /api/v1/comments/{comment_id}/reject` → `{message:"已拒绝"}`
- `PUT /api/v1/comments/{comment_id}/dismiss-report` → `{message:"举报已驳回，评论保留"}`
- `PUT /api/v1/comments/{comment_id}/confirm-report` → `{message:"举报确认，评论已删除"}`
- `DELETE /api/v1/comments/{comment_id}` → `{message:"删除成功"}`
- `POST /api/v1/comments/{comment_id}/reply`（管理员回复）请求体：`AdminReplyCreate` → 响应：`CommentResponse`

常见错误码：
- `401/403`：鉴权失败
- `404`：评论不存在（针对 comment_id 的接口）
- `422`

---

## 9. Prompt（Prompts）`/api/v1/prompts`

> 路由文件：`backend/app/api/v1/prompts.py`
>
> 相关 Schema：`backend/app/schemas/prompt.py`

### 9.1 获取 Prompt 列表（approved，分页）

- **URL**：`/api/v1/prompts`
- **Method**：`GET`
- **鉴权**：无
- **响应**：`PaginatedResponse[PromptListResponse]`

Query 参数：
| 参数 | 类型 | 默认 | 约束 |
|---|---|---|---|
| page | int | 1 | ge=1 |
| page_size | int | 10 | 1~50 |
| category | string | - | 分类过滤 |

---

### 9.2 管理端：待审核 Prompt（分页）

- **URL**：`/api/v1/prompts/pending`
- **Method**：`GET`
- **鉴权**：需要管理员
- **响应**：`PaginatedResponse[PromptResponse]`

Query：`page`（默认 1），`page_size`（默认 20，1~50）

---

### 9.3 获取 Prompt 详情

- **URL**：`/api/v1/prompts/{prompt_id}`
- **Method**：`GET`
- **鉴权**：无
- **错误码**：`404 Prompt 不存在`

---

### 9.4 管理端：创建 Prompt（直接 approved）

- **URL**：`/api/v1/prompts`
- **Method**：`POST`
- **鉴权**：需要管理员
- **请求体 Schema**：`PromptCreate`（`backend/app/schemas/prompt.py:22-25`）

---

### 9.5 用户提交 Prompt（pending）

- **URL**：`/api/v1/prompts/submit`
- **Method**：`POST`
- **鉴权**：无
- **请求体 Schema**：`PromptUserSubmit`（`backend/app/schemas/prompt.py:27-30`）

---

### 9.6 更新/删除/审核/使用/点赞

- `PUT /api/v1/prompts/{prompt_id}`（管理员；作者或超管）
- `DELETE /api/v1/prompts/{prompt_id}`（管理员；作者或超管）
- `PUT /api/v1/prompts/{prompt_id}/approve`（管理员）
- `PUT /api/v1/prompts/{prompt_id}/reject`（管理员）
- `POST /api/v1/prompts/{prompt_id}/use`（公开）
- `POST /api/v1/prompts/{prompt_id}/like`（公开）
- `POST /api/v1/prompts/{prompt_id}/unlike`（公开）

错误码（常见）：`404/403/401/422`

---

## 10. AI 聊天（Chat）`/api/v1/chat`

> 路由文件：`backend/app/api/v1/chat.py`
>
> 相关 Schema：`backend/app/schemas/chat.py`

### 10.1 创建聊天会话

- **URL**：`/api/v1/chat/session`
- **Method**：`POST`
- **鉴权**：无
- **响应 Schema**：`ChatSessionResponse`（`backend/app/schemas/chat.py:37-46`）

---

### 10.2 发送消息（非流式）

- **URL**：`/api/v1/chat/message`
- **Method**：`POST`
- **鉴权**：无
- **请求体 Schema**：`ChatMessageCreate`（`backend/app/schemas/chat.py:20-24`）
- **响应体 Schema**：`ChatResponse`（`backend/app/schemas/chat.py:53-58`）

错误码：
- `404`：会话不存在（当显式传入 `session_id` 且不存在时）

---

### 10.3 发送消息（流式，纯文本）

- **URL**：`/api/v1/chat/message/stream`
- **Method**：`POST`
- **鉴权**：无
- **请求体**：同 `ChatMessageCreate`
- **响应**：`Content-Type: text/plain` 的 **纯文本流**（非 SSE）
- **实现**：`backend/app/api/v1/chat.py`

客户端要点：
- 直接读取 response body 的增量文本片段并拼接
- 异常时可能在流中输出：`[系统错误]: ...`

---

### 10.4 删除聊天会话

- **URL**：`/api/v1/chat/session/{session_id}`
- **Method**：`DELETE`
- **鉴权**：无
- **响应**：`{"message":"删除成功"}`

错误码：
- `404`：会话不存在

---

### 10.5 Prompt 实验室

- **URL**：`/api/v1/chat/prompt-lab`
- **Method**：`POST`
- **鉴权**：无
- **请求体 Schema**：`PromptLabRequest`（`backend/app/schemas/chat.py:60-66`）
- **响应体 Schema**：`PromptLabResponse`（`backend/app/schemas/chat.py:68-74`）

错误码：
- `500`：AI 服务错误（`detail` 包含异常信息）

---

## 11. AI Agent（SSE）`/api/v1/agent`

> 路由文件：`backend/app/api/v1/agent.py`
>
> 相关 Schema：`backend/app/schemas/agent.py`

### 11.1 Agent 聊天（SSE 流）

- **用途**：管理员使用带工具调用的 Agent 对话
- **URL**：`/api/v1/agent/chat`
- **Method**：`POST`
- **鉴权**：需要管理员
- **请求体 Schema**：`AgentChatRequest`（`backend/app/schemas/agent.py:14-18`）
- **响应**：SSE（`Content-Type: text/event-stream`）

SSE 行格式（每条事件）：
```
event: <type>
data: <JSON字符串>

```

事件类型与 data 结构（真实提取自 `backend/app/services/agent/service.py` 与 `backend/app/api/v1/agent.py`）：

- `ready`：`{"session_id": "..."}`
- `thinking`：`{"content": "..."}`
- `tool_start`：`{"tool_call_id":"...","name":"...","arguments":"...","kind":"skill|tool"}`
- `tool_result`：`{"tool_call_id":"...","result":{...},"kind":"skill|tool"}`
- `text`：`{"content":"..."}`
- `done`：`{"session_id":"..."}`
- `error`：`{"message":"..."}`

错误码：
- `401/403`：鉴权失败
- `404`：会话不存在（当传入 `session_id` 且不存在）

---

### 11.2 Agent 会话管理

均需管理员鉴权：

- `GET /api/v1/agent/sessions` → `AgentSessionResponse[]`
- `GET /api/v1/agent/sessions/{session_id}` → `AgentSessionWithMessages`
- `DELETE /api/v1/agent/sessions/{session_id}` → `{message:"删除成功"}`

错误码：`401/403/404/422`

---

## 12. 文件上传（Upload）`/api/v1/upload`

> 路由文件：`backend/app/api/v1/upload.py`

### 12.1 上传图片

- **URL**：`/api/v1/upload/image`
- **Method**：`POST`
- **鉴权**：需要管理员
- **请求**：`multipart/form-data`
  - `file`: 文件（必填）
  - `article_id`: int（可选，通常为 query 参数）

文件类型限制（按 `content_type`）：
- `image/jpeg` `.jpg`
- `image/png` `.png`
- `image/gif` `.gif`
- `image/webp` `.webp`

大小限制：默认 10MB（来自配置）

响应示例：
```json
{"id":1,"url":"/uploads/images/xxx.jpg","filename":"a.jpg","size":12345}
```

错误码：
- `400`：不支持的文件类型 / 文件过大
- `401/403/422`

---

### 12.2 获取图片列表（最多 100 条）

- `GET /api/v1/upload/images`
- 鉴权：需要管理员

---

### 12.3 删除图片

- `DELETE /api/v1/upload/image/{image_id}`
- 鉴权：需要管理员
- 错误码：`404 图片不存在`

---

### 12.4 上传 Markdown 并返回内容

- `POST /api/v1/upload/markdown`
- 鉴权：需要管理员
- `multipart/form-data`：`file`（必须，后缀 `.md`）

响应：
```json
{"title":"...","content":"...","filename":"..."}
```

---

### 12.5 上传 Markdown+图片 ZIP

- `POST /api/v1/upload/markdown-zip`
- 鉴权：需要管理员
- `multipart/form-data`：`file`（必须，后缀 `.zip`）

响应：
```json
{"title":"...","content":"...","filename":"...","images_processed":3}
```

重要行为：该接口会把 Markdown 写入 `F:\My_Blog\Articles\Uncategorized\<标题>.md`（见 `backend/app/api/v1/upload.py`）。

---

## 13. 统计（Stats）`/api/v1/stats`

> 路由文件：`backend/app/api/v1/stats.py`
>
> 相关 Schema：`backend/app/schemas/stats.py`

### 13.1 记录页面访问

- **URL**：`/api/v1/stats/page-view`
- **Method**：`POST`
- **鉴权**：无
- **请求体 Schema**：`PageViewCreate`（`backend/app/schemas/stats.py:11-16`）

响应：`{"message":"已记录"}`

---

### 13.2 统计概览（管理员）

- `GET /api/v1/stats/overview`
- 鉴权：需要管理员
- 响应 Schema：`StatsOverview`（`backend/app/schemas/stats.py:41-50`）

---

### 13.3 每日统计（管理员）

- `GET /api/v1/stats/daily?days=7`
- 鉴权：需要管理员
- Query：`days` 默认 7，范围 1~90
- 响应：`DailyStatResponse[]`

---

### 13.4 热门文章（管理员）

- `GET /api/v1/stats/popular-articles?limit=10`
- 鉴权：需要管理员
- Query：`limit` 默认 10，范围 1~50
- 响应：`PopularArticle[]`

---

### 13.5 修改每日统计（增量式，管理员）

- `POST /api/v1/stats/update-daily`
- 鉴权：需要管理员
- 请求体 Schema：`DailyStatUpdate`（`backend/app/schemas/stats.py:31-39`）

---

## 14. 站点配置（Settings）`/api/v1/settings`

> 路由文件：`backend/app/api/v1/settings.py`
>
> 相关 Schema：`backend/app/schemas/stats.py`（站点配置相关模型在此文件中）

### 14.1 获取公开配置

- `GET /api/v1/settings/public`
- 鉴权：无
- 响应 Schema：`PublicSiteSettings`（`backend/app/schemas/stats.py:85-92`）

---

### 14.2 获取全部配置（超管）

- `GET /api/v1/settings`
- 鉴权：需要超级管理员
- 响应 Schema：`SiteSettingResponse[]`（`backend/app/schemas/stats.py:60-69`）

---

### 14.3 批量更新配置（超管）

- `PUT /api/v1/settings/batch`
- 鉴权：需要超级管理员
- 请求体：`{ "key": "value", ... }`（值会被转成字符串保存）
- 响应：`{ "message":"批量更新成功", "updated_keys":[...] }`

---

### 14.4 更新单个配置项（超管）

- `PUT /api/v1/settings/{key}`
- 鉴权：需要超级管理员
- 请求体 Schema：`SiteSettingUpdate`（`backend/app/schemas/stats.py:71-74`）

---

## 15. 订阅（Subscribe）`/api/v1/*`

> 注意：该模块在 `router.py` 中 **无 prefix**（见 `backend/app/api/v1/router.py:32`），因此路径直接挂在 `/api/v1` 下。
>
> 路由文件：`backend/app/api/v1/subscribe.py`
>
> 相关 Schema：`backend/app/schemas/subscriber.py`

### 15.1 订阅

- `POST /api/v1/subscribe`
- 鉴权：无
- 请求体 Schema：`SubscribeRequest`（`backend/app/schemas/subscriber.py:11-14`）
- 响应体 Schema：`SubscribeResponse`（`backend/app/schemas/subscriber.py:16-20`）

---

### 15.2 取消订阅

- `GET /api/v1/unsubscribe/{token}`
- 鉴权：无
- 错误码：`404 无效 token`（`detail="无效的取消订阅链接"`）

---

### 15.3 订阅管理（管理员）

- `GET /api/v1/subscribers` → `SubscriberResponse[]`
- `DELETE /api/v1/subscribers/{subscriber_id}`
- `GET /api/v1/subscribers/count` → `{count:int}`
- `PUT /api/v1/subscribers/{subscriber_id}/freeze?frozen=true` → `SubscriberResponse`
- `PUT /api/v1/subscribers/freeze-all?frozen=true` → `{message:str,count:int}`

---

## 16. 论坛（Forum）`/api/v1/forum`

> 路由文件：`backend/app/api/v1/forum.py`
>
> 相关 Schema：`backend/app/schemas/forum.py`
>
> 分页：`backend/app/schemas/common.py`

### 16.1 获取分类列表

- **URL**：`/api/v1/forum/categories`
- **Method**：`GET`
- **鉴权**：无
- **响应 Schema**：`ForumCategoryResponse[]`（`backend/app/schemas/forum.py:18-25`）
- **实现**：`backend/app/api/v1/forum.py:118-127`

---

### 16.2 获取主题列表（分页 + 搜索）

- **URL**：`/api/v1/forum/threads`
- **Method**：`GET`
- **鉴权**：无
- **响应**：`PaginatedResponse[ForumThreadListItem]`
- **实现**：`backend/app/api/v1/forum.py:129-188`

Query 参数：
| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| page | int | 1 | ge=1 | 页码 |
| page_size | int | 10 | 1~100 | 每页条数 |
| category_id | int | - | - | 分类过滤 |
| q | string | - | - | 标题关键字搜索 |

错误码：
- `422`：参数校验失败

---

### 16.3 创建主题（匿名 + 反滥用）

- **URL**：`/api/v1/forum/threads`
- **Method**：`POST`
- **鉴权**：无
- **请求体 Schema**：`ForumThreadCreateRequest`（`backend/app/schemas/forum.py:86-95`）
- **响应体 Schema**：`ForumThreadDetailResponse`（`backend/app/schemas/forum.py:46-67`）
- **实现**：`backend/app/api/v1/forum.py:190-274`

请求体字段：
| 字段 | 类型 | 必填 | 约束 | 说明 |
|---|---|---:|---|---|
| category_id | int | 是 | - | 分类 ID（必须存在且 is_active=true） |
| title | string | 是 | 1~200 | 标题 |
| content | string | 是 | 1~20000 | 首帖内容（Markdown 文本） |
| nickname | string | 否 | max_length=50 | 昵称（不填自动生成 `游客xxxx`） |
| email | string(email) | 否 | - | 邮箱（仅存储，不对外返回） |
| honeypot | string | 否 | max_length=200 | 蜜罐字段（正常必须为空） |

反滥用/限频：
- 蜜罐字段非空：`400 detail="请求无效"`
- Redis 限频（Redis 不可用会降级放行）：
  - 发主题：`2 次 / 60 秒`，超限 `429 detail="操作过于频繁，请稍后再试"`

错误码：
- `400`：分类不存在 / 蜜罐触发
- `429`：限频
- `422`

---

### 16.4 获取主题详情

- **URL**：`/api/v1/forum/threads/{thread_id}`
- **Method**：`GET`
- **鉴权**：无
- **响应**：`ForumThreadDetailResponse`
- **实现**：`backend/app/api/v1/forum.py:276-309`

行为要点：
- 仅 `status=="approved"` 可见，否则 `404 detail="主题不存在"`
- 每次访问会 `view_count += 1`

错误码：
- `404`：主题不存在
- `422`

---

### 16.5 获取主题楼层列表（分页）

- **URL**：`/api/v1/forum/threads/{thread_id}/posts`
- **Method**：`GET`
- **鉴权**：无
- **响应**：`PaginatedResponse[ForumPostResponse]`
- **实现**：`backend/app/api/v1/forum.py:311-361`

Query 参数：
| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| page | int | 1 | ge=1 | 页码 |
| page_size | int | 30 | 1~100 | 每页条数 |

错误码：
- `404`：主题不存在
- `422`

---

### 16.6 回复主题（匿名 + 反滥用）

- **URL**：`/api/v1/forum/threads/{thread_id}/posts`
- **Method**：`POST`
- **鉴权**：无
- **请求体 Schema**：`ForumPostCreateRequest`（`backend/app/schemas/forum.py:97-106`）
- **响应体 Schema**：`ForumPostResponse`（`backend/app/schemas/forum.py:69-84`）
- **实现**：`backend/app/api/v1/forum.py:363-453`

请求体字段：
| 字段 | 类型 | 必填 | 约束 | 说明 |
|---|---|---:|---|---|
| content | string | 是 | 1~20000 | 回复内容（Markdown） |
| nickname | string | 否 | max_length=50 | 昵称（不填生成游客昵称） |
| email | string(email) | 否 | - | 邮箱（仅存储，不对外返回） |
| parent_id | int | 否 | - | 引用楼层（必须存在且属于同 thread） |
| honeypot | string | 否 | max_length=200 | 蜜罐字段 |

反滥用/限频：
- 蜜罐字段非空：`400 detail="请求无效"`
- Redis 限频：`5 次 / 30 秒`，超限 `429 detail="操作过于频繁，请稍后再试"`

错误码：
- `404`：主题不存在
- `403`：主题已锁定（`detail="该主题已锁定，无法回复"`）
- `400`：引用楼层不存在（`detail="引用楼层不存在"`）
- `429`：限频
- `422`

---

### 16.7 管理端：编辑/删除主题与楼层（管理员）

> 以下接口均需管理员鉴权（`get_current_admin`）

1) **编辑主题**
- `PUT /api/v1/forum/threads/{thread_id}`
- 请求体 Schema：`ForumThreadAdminUpdateRequest`（`backend/app/schemas/forum.py:108-114`）
- 错误码：
  - `404 主题不存在`
  - `400 分类不存在`
  - `401/403/422`

2) **删除主题**（逻辑删除：`status="deleted"`）
- `DELETE /api/v1/forum/threads/{thread_id}`
- 响应：`{"message":"删除成功"}`
- 错误码：`404/401/403/422`

3) **编辑楼层**（会标记为管理员发言）
- `PUT /api/v1/forum/posts/{post_id}`
- 请求体 Schema：`ForumPostAdminUpdateRequest`（`backend/app/schemas/forum.py:116-118`）
- 响应：`ForumPostResponse`
- 错误码：`404 楼层不存在` + `401/403/422`

4) **删除楼层**（逻辑删除：`status="deleted"`）
- `DELETE /api/v1/forum/posts/{post_id}`
- 响应：`{"message":"删除成功"}`
- 错误码：`404/401/403/422`

---

## 17. 待确认问题清单（从代码行为推导，建议产品/后端确认）

1) `PUT /api/v1/auth/password` **可能允许不提供 old_password 也能修改自己的密码**：
   - Schema 描述“超级管理员可不填”，但该接口是“改自己密码”；且代码中未提供 old_password 的分支仅 `pass`（需核对 `backend/app/api/v1/auth.py` 具体逻辑）。

2) 若干接口未声明 `response_model`，导致 OpenAPI 中响应结构不够明确：
   - 例如：`/api/v1/auth/logout`、`/api/v1/auth/password`、`DELETE /api/v1/admins/{admin_id}`、多处删除/审核接口等。

3) `GET /api/v1/articles/{article_id}/like-status` 未显式校验文章存在性：
   - 文章不存在时返回内容可能与预期不一致（需要以后端实际实现为准）。

4) `POST /api/v1/chat/message` 与 `POST /api/v1/chat/message/stream` 对不存在 session 的行为不一致：
   - 非流式：会话不存在返回 `404`；
   - 流式：会“容错创建新会话”。

5) `POST /api/v1/chat/message` 在 OpenAI 调用失败时不会返回 `5xx`，而是返回 `200` 且把错误文案写入回复内容：
   - 前端若要区分“AI 真回复”与“错误提示”，需要额外策略。

6) `POST /api/v1/upload/markdown-zip` 存在额外副作用：
   - 会把 Markdown 写入项目目录 `Articles/Uncategorized/`，这是否符合生产环境预期需确认。

7) 论坛接口（匿名）使用 IP+UA 生成 user_identifier，并在 Redis 可用时启用限频：
   - Redis 不可用会降级放行；是否需要更严格防滥用策略需确认。
