# 热点文章上传接口文档

> 状态：已上线
> 适用场景：第三方系统、自动写稿器、CMS、人工后台录入
> 接口版本：基于当前博客后端 `/api/v1/hotspots`

---

## 1. 接口用途

用于**直接创建一篇热点文章**，支持以下模式：

- 创建草稿（draft）
- 创建并直接发布（published）
- slug 冲突时报错
- slug 冲突时按 slug 更新已有热点（幂等 / upsert）

---

## 2. 接口地址

```http
POST /api/v1/hotspots
```

### 完整示例

```http
POST https://YOUR_DOMAIN/api/v1/hotspots
```

或者本地后端直连：

```http
POST http://127.0.0.1:8000/api/v1/hotspots
```

---

## 3. 鉴权方式

接口受管理员鉴权保护，必须携带 Bearer Token：

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Token 获取方式

先调用：

```http
POST /api/v1/auth/login
```

成功后获得：

- `access_token`

之后将其放入 `Authorization` 头即可。

---

## 4. 请求体 schema

```json
{
  "topic_date": "2026-03-28",
  "title": "AI 生图真正难的不是“更像”，而是“更对”",
  "slug": "bizgeneval-commercial-visual-generation-benchmark",
  "summary": "过去两年，图像模型最常被展示的是一张好看的图，但企业真正关心的是商业视觉内容是否满足约束。",
  "analysis_md": "# 标题\n\n这里是完整 Markdown 正文……",
  "key_points_json": {
    "queue_slot": "manual",
    "generated_at": "2026-03-28T19:00:00+08:00",
    "word_count_estimate": 11451,
    "has_image": true,
    "has_table": true,
    "publish_pending": true,
    "pipeline_state": "draft_ready"
  },
  "heat_score": 95,
  "primary_category": "AI应用落地",
  "tag_names": [
    "AI",
    "BizGenEval",
    "商业视觉生成",
    "Benchmark"
  ],
  "sources": [
    {
      "source_type": "manual",
      "source_name": "arXiv",
      "source_url": "https://arxiv.org/abs/xxxx.xxxxx",
      "source_domain": "arxiv.org",
      "original_title": "BizGenEval",
      "published_at": "2026-03-26T00:00:00+00:00",
      "content_snippet": "论文摘要……",
      "quality_score": 95
    }
  ],
  "status": "draft",
  "published_at": null,
  "auto_publish": false,
  "upsert_strategy": "error"
}
```

---

## 5. 字段说明

### 5.1 必填字段

#### `topic_date`
- 类型：`string (YYYY-MM-DD)`
- 含义：热点主题日期
- 示例：
```json
"topic_date": "2026-03-28"
```

#### `title`
- 类型：`string`
- 约束：1~220 字符
- 含义：热点标题

#### `slug`
- 类型：`string`
- 约束：1~220 字符
- 含义：热点唯一标识
- 说明：系统按 `slug` 做冲突判断与幂等处理

---

### 5.2 推荐必填字段

#### `summary`
- 类型：`string | null`
- 含义：文章摘要

#### `analysis_md`
- 类型：`string | null`
- 含义：完整 Markdown 正文
- 说明：热点主内容，强烈建议必填

#### `primary_category`
- 类型：`string | null`
- 最大长度：50
- 含义：主分类
- 示例：
```json
"primary_category": "AI基础设施"
```

#### `heat_score`
- 类型：`number`
- 最小值：0
- 含义：热度分

#### `tag_names`
- 类型：`string[]`
- 含义：标签名列表
- 说明：后端会按标签名自动关联或创建标签

---

### 5.3 来源字段

#### `sources`
- 类型：`HotTopicSourceCreateInput[]`
- 含义：来源列表

每一项格式：

```json
{
  "source_type": "manual",
  "source_name": "arXiv",
  "source_url": "https://arxiv.org/abs/xxxx.xxxxx",
  "source_domain": "arxiv.org",
  "original_title": "论文原标题",
  "published_at": "2026-03-26T00:00:00+00:00",
  "content_snippet": "摘要或片段",
  "quality_score": 95
}
```

#### `source_type`
可选值：
- `rss`
- `api`
- `manual`

默认值：
```json
"manual"
```

---

### 5.4 扩展元数据

#### `key_points_json`
- 类型：`object | null`
- 含义：扩展信息 / 流水线字段 / 归档信息
- 用途包括：
  - `queue_slot`
  - `generated_at`
  - `word_count_estimate`
  - `has_image`
  - `has_table`
  - `archive_markdown_path`
  - `pipeline_state`
  - `publish_pending`

#### 系统自动补写字段
若不存在，后端会补写：
- `archive_markdown_path`
- `pipeline_state`
- `publish_pending`

---

### 5.5 发布控制字段

#### `status`
- 类型：`string`
- 可选值：
  - `draft`
  - `published`
  - `hidden`
- 默认：
```json
"draft"
```

#### `published_at`
- 类型：`datetime | null`
- 含义：发布时间
- 规则：
  - 如果 `status=published` 可显式传入
  - 如果不传，系统会自动补当前时间

#### `auto_publish`
- 类型：`boolean`
- 默认：`false`
- 含义：提交后是否直接正式发布
- 规则：若为 `true`，会强制进入 `published`

---

### 5.6 幂等与冲突控制

#### `upsert_strategy`
- 类型：`string`
- 可选值：
  - `error`
  - `update`
- 默认：
```json
"error"
```

含义：
- `error`：slug 冲突时报错
- `update`：slug 冲突时，按 slug 更新已有热点

---

## 6. 幂等策略

当前接口的幂等主键是：

```text
slug
```

### 策略 A：`upsert_strategy = "error"`
如果 slug 已存在：
- 返回 `409 Conflict`

适合：
- 外部系统严格要求唯一写入
- 不允许覆盖已有热点

### 策略 B：`upsert_strategy = "update"`
如果 slug 已存在：
- 不新建记录
- 直接更新已有热点

适合：
- 幂等重试
- 覆盖式同步
- 同一 slug 重复推送

---

## 7. slug 冲突处理规则

### 当 slug 不存在
系统会：
1. 创建 `hot_topics`
2. 创建 `hot_topic_sources`
3. 关联标签
4. 写归档 Markdown
5. 根据状态决定是否直接发布

### 当 slug 已存在且 `upsert_strategy = "error"`
返回：

```http
409 Conflict
```

响应 detail：

```json
{
  "detail": "slug 已存在，请更换 slug 或使用 update 策略"
}
```

### 当 slug 已存在且 `upsert_strategy = "update"`
- 更新已有热点
- 不会新增第二条同 slug 数据

---

## 8. draft / publish 行为

### 8.1 创建草稿
条件：
- `status = "draft"`
- `auto_publish = false`

结果：
- 仅创建草稿
- 不自动正式发布
- 不进入普通文章系统

适合：
- 后台人工二次校对
- 先导入再审核

### 8.2 创建并直接发布
条件：
- `status = "published"`
  或
- `auto_publish = true`

结果：
- 直接进入已发布状态
- 若未指定 `published_at`，系统自动填当前时间
- 同步落盘到：

```text
/data/My_Blog/Articles/<分类>/<topic_date>/<slug>.md
```

### 8.3 创建隐藏热点
条件：
- `status = "hidden"`

结果：
- 创建即隐藏
- 前台默认不可见
- 但保留在热点系统中

---

## 9. 系统强约束（重要）

该接口已经内置以下约束：

### 不会写入普通文章表
- 不创建 `articles`
- 不做热点锚点文章

### `article_id` 永远保持为空
后端会强制：

```python
topic.article_id = None
```

所以热点只存在于热点系统，不会串路到普通文章页。

---

## 10. 成功响应示例

```json
{
  "id": 123,
  "topic_date": "2026-03-28",
  "title": "AI 生图真正难的不是“更像”，而是“更对”",
  "slug": "bizgeneval-commercial-visual-generation-benchmark",
  "summary": "过去两年，图像模型最常被展示的是一张好看的图，但企业真正关心的是商业视觉内容是否满足约束。",
  "analysis_md": "# 标题\n\n这里是完整 Markdown 正文……",
  "key_points_json": {
    "queue_slot": "manual",
    "generated_at": "2026-03-28T19:00:00+08:00",
    "word_count_estimate": 11451,
    "has_image": true,
    "has_table": true,
    "publish_pending": true,
    "pipeline_state": "draft_ready",
    "archive_markdown_path": "/data/My_Blog/Articles/AI应用落地/2026-03-28/bizgeneval-commercial-visual-generation-benchmark.md"
  },
  "heat_score": 95,
  "status": "draft",
  "primary_category": "AI应用落地",
  "published_at": null,
  "article_id": null,
  "comment_count": 0,
  "source_count": 1,
  "source_type": "manual",
  "source_types": [],
  "source_domains": ["arxiv.org"],
  "tags": ["AI", "BizGenEval", "商业视觉生成", "Benchmark"],
  "sources": [
    {
      "id": 999,
      "source_type": "manual",
      "source_name": "arXiv",
      "source_domain": "arxiv.org",
      "source_url": "https://arxiv.org/abs/xxxx.xxxxx",
      "original_title": "BizGenEval",
      "published_at": "2026-03-26T00:00:00",
      "content_snippet": "论文摘要……",
      "quality_score": 95,
      "created_at": "2026-03-28T20:12:00"
    }
  ],
  "created_at": "2026-03-28T20:12:00",
  "updated_at": "2026-03-28T20:12:00"
}
```

---

## 11. 常见错误码

### `401 Unauthorized`
未携带管理员 token，或 token 已失效。

### `409 Conflict`
slug 冲突且 `upsert_strategy = "error"`。

### `422 Unprocessable Entity`
请求体字段不合法，例如：
- 缺少 `title`
- 缺少 `slug`
- `topic_date` 格式错误
- `source_url` 长度非法
- `heat_score < 0`

---

## 12. 推荐接入方式

### 方案 1：第三方系统直接对接 HTTP API
推荐流程：
1. 登录获取管理员 token：
   ```http
   POST /api/v1/auth/login
   ```
2. 调用创建接口：
   ```http
   POST /api/v1/hotspots
   ```
3. 如果只想先导入草稿，再审核发布：
   ```http
   POST /api/v1/hotspots/{id}/publish
   ```

### 方案 2：外部系统做幂等覆盖
如果希望“同一 slug 重传即更新”，建议：

```json
"upsert_strategy": "update"
```

这样最适合自动写稿系统、CMS 同步器、任务重试器。

---

## 13. curl 示例

### 创建草稿

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/hotspots" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topic_date": "2026-03-28",
    "title": "BizGenEval 热点文章",
    "slug": "bizgeneval-commercial-visual-generation-benchmark",
    "summary": "商业视觉生成正在从审美竞赛转向约束执行。",
    "analysis_md": "# BizGenEval\n\n正文内容……",
    "primary_category": "AI应用落地",
    "heat_score": 95,
    "tag_names": ["AI", "Benchmark"],
    "sources": [
      {
        "source_type": "manual",
        "source_name": "arXiv",
        "source_url": "https://arxiv.org/abs/xxxx.xxxxx",
        "source_domain": "arxiv.org"
      }
    ],
    "status": "draft",
    "auto_publish": false,
    "upsert_strategy": "error"
  }'
```

### 创建并直接发布

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/hotspots" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topic_date": "2026-03-28",
    "title": "BizGenEval 热点文章",
    "slug": "bizgeneval-commercial-visual-generation-benchmark",
    "summary": "商业视觉生成正在从审美竞赛转向约束执行。",
    "analysis_md": "# BizGenEval\n\n正文内容……",
    "primary_category": "AI应用落地",
    "heat_score": 95,
    "tag_names": ["AI", "Benchmark"],
    "sources": [
      {
        "source_type": "manual",
        "source_name": "arXiv",
        "source_url": "https://arxiv.org/abs/xxxx.xxxxx"
      }
    ],
    "auto_publish": true,
    "upsert_strategy": "update"
  }'
```

---

## 14. 当前上线状态

当前已确认：
- `POST /api/v1/hotspots` 已上线
- 首页“最新热点”模块已上线
- 后台上传页 `/admin/hotspots/upload` 已部署
- 热点上传功能目前可通过后台页面直接使用

---

## 15. 维护建议

1. 外部系统推荐统一使用 `slug` 做幂等主键。
2. 自动发布场景推荐：
   - `auto_publish=true`
   - `upsert_strategy=update`
3. 若需人工审核，推荐：
   - `status=draft`
   - 由后台编辑器二次校对后再发布。
4. `sources` 建议至少传一条原始来源，避免热点内容缺少追溯依据。

---

## 16. 对应实现位置

### 后端
- `backend/app/api/v1/hotspots.py`
- `backend/app/schemas/hot_topic.py`
- `backend/app/services/hot_topic_service.py`

### 前端
- `frontend/api/hotspots.ts`
- `frontend/pages/HotspotUploadPage.tsx`
- `frontend/pages/HotspotManager.tsx`

---

如需继续增强，可下一步做：
- 结构化来源表单（替代纯 JSON 输入）
- 批量导入接口
- 带 `Idempotency-Key` header 的更强幂等支持
- 上传后自动返回前台预览 URL
- Swagger / OpenAPI 示例补全
