# My_Blog 接口总表（自动扫描）

> 生成时间：2026-03-19 23:56:32 +0800

## 一、后端 FastAPI 路由（backend/app/api/v1）

### admins.py
- `GET` `/`
- `POST` `/`
- `GET` `/{admin_id}`
- `PUT` `/{admin_id}`
- `DELETE` `/{admin_id}`
- `PUT` `/{admin_id}/password`

### agent.py
- `POST` `/chat`
- `GET` `/sessions`
- `GET` `/sessions/{session_id}`
- `DELETE` `/sessions/{session_id}`

### articles.py
- `GET` `/`
- `GET` `/tags`
- `GET` `/categories`
- `GET` `/archives`
- `GET` `/series/{category}`
- `GET` `/slug/{slug}`
- `GET` `/{article_id}`
- `POST` `/{article_id}/like`
- `GET` `/{article_id}/like-status`
- `POST` `/`
- `PUT` `/{article_id}`
- `DELETE` `/{article_id}`
- `POST` `/{article_id}/publish`
- `POST` `/upload-markdown`
- `POST` `/generate-summary`
- `POST` `/fix-read-time`

### auth.py
- `POST` `/login`
- `POST` `/logout`
- `GET` `/me`
- `PUT` `/me`
- `PUT` `/password`

### chat.py
- `POST` `/session`
- `POST` `/message`
- `POST` `/message/stream`
- `GET` `/session/{session_id}/history`
- `DELETE` `/session/{session_id}`
- `POST` `/prompt-lab`

### comment.py

### comments.py
- `GET` `/article/{article_id}`
- `POST` `/article/{article_id}`
- `POST` `/{comment_id}/like`
- `GET` `/{comment_id}/like-status`
- `POST` `/{comment_id}/report`
- `GET` `/pending`
- `GET` `/reported`
- `GET` `/approved`
- `PUT` `/{comment_id}/approve`
- `PUT` `/{comment_id}/reject`
- `PUT` `/{comment_id}/dismiss-report`
- `PUT` `/{comment_id}/confirm-report`
- `DELETE` `/{comment_id}`
- `POST` `/{comment_id}/reply`

### forum.py
- `GET` `/categories`
- `GET` `/threads`
- `POST` `/threads`
- `GET` `/threads/{thread_id}`
- `GET` `/threads/{thread_id}/posts`
- `POST` `/threads/{thread_id}/posts`
- `PUT` `/threads/{thread_id}`
- `DELETE` `/threads/{thread_id}`
- `PUT` `/posts/{post_id}`
- `DELETE` `/posts/{post_id}`

### hotspots.py
- `GET` `/`
- `GET` `/admin/list`
- `GET` `/admin/{topic_id}`
- `GET` `/{topic_id}`
- `GET` `/{topic_id}/sources`
- `POST` `/tasks/run`
- `GET` `/tasks/list`
- `PUT` `/{topic_id}`
- `POST` `/{topic_id}/publish`
- `POST` `/{topic_id}/hide`
- `POST` `/settings/init`

### __init__.py

### prompts.py
- `GET` `/`
- `GET` `/pending`
- `GET` `/{prompt_id}`
- `POST` `/`
- `POST` `/submit`
- `PUT` `/{prompt_id}`
- `DELETE` `/{prompt_id}`
- `PUT` `/{prompt_id}/approve`
- `PUT` `/{prompt_id}/reject`
- `POST` `/{prompt_id}/use`
- `POST` `/{prompt_id}/like`
- `POST` `/{prompt_id}/unlike`

### router.py

### settings.py
- `GET` `/public`
- `GET` `/`
- `PUT` `/batch`
- `PUT` `/{key}`

### stats.py
- `POST` `/page-view`
- `GET` `/overview`
- `GET` `/daily`
- `GET` `/popular-articles`
- `PUT` `/update-daily`

### subscribe.py
- `PUT` `/subscribers/freeze-all`
- `POST` `/subscribe`
- `GET` `/unsubscribe/{token}`
- `GET` `/subscribers`
- `DELETE` `/subscribers/{subscriber_id}`
- `GET` `/subscribers/count`
- `PUT` `/subscribers/{subscriber_id}/freeze`

### upload.py
- `POST` `/image`
- `GET` `/images`
- `DELETE` `/image/{image_id}`
- `DELETE` `/images/{image_id}`
- `POST` `/markdown`
- `POST` `/markdown-zip`

## 二、前端 API 调用（frontend/api/*.ts）

### articles.ts
- `GET` `/articles`
- `POST` `/articles`
- `GET` `/articles/tags`
- `GET` `/articles/categories`
- `GET` `/articles/archives`
- `POST` `/articles/upload-markdown`

### auth.ts
- `POST` `/auth/logout`
- `PUT` `/auth/password`

### chat.ts
- `POST` `/chat/session`
- `POST` `/chat/message`
- `POST` `/chat/prompt-lab`

### comments.ts
- `GET` `/comments/pending`
- `GET` `/comments/approved`

### config.ts

### hotspots.ts
- `POST` `/hotspots/tasks/run`
- `GET` `/hotspots/tasks/list`

### index.ts

### prompts.ts
- `GET` `/prompts`
- `GET` `/prompts/pending`
- `POST` `/prompts`
- `POST` `/prompts/submit`

### stats.ts
- `POST` `/stats/page-view`
- `GET` `/stats/overview`
- `GET` `/stats/daily`
- `GET` `/stats/popular-articles`
- `GET` `/settings/public`
- `GET` `/settings`
- `PUT` `/settings/batch`

### subscribe.ts
- `POST` `/subscribe`

### upload.ts
- `POST` `/upload/image`
- `POST` `/upload/markdown`
- `POST` `/upload/markdown-zip`
- `GET` `/upload/images`

## 三、热点模块对照（重点）

### 公共前台（admin_mode=false）
- `GET /hotspots`
- `GET /hotspots/{topic_id}`
- `GET /hotspots/{topic_id}/sources`

### 后台管理（需管理员）
- `GET /hotspots/admin/list`
- `GET /hotspots/admin/{topic_id}`
- `PUT /hotspots/{topic_id}`
- `POST /hotspots/{topic_id}/publish`
- `POST /hotspots/{topic_id}/hide`
- `POST /hotspots/tasks/run`
- `GET /hotspots/tasks/list`

### 前端已接线
- Public: `/#/hotspots`, `/#/hotspots/:id`
- Admin: `/#/admin/hotspots`
