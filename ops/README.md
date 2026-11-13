# ops/activity —— 自动化运行台账

每天把博客定时任务的真实状态写进 `ops/activity/YYYY-MM-DD.md`，并由服务器 cron 自动提交到 `master`。
目的：让 GitHub 贡献图每天有稳定的 10–13 次提交，同时留下一份可回溯的运行记录。

## 为什么不会触发 CI

- `ci-cd.yml` 的 `paths-ignore` 含 `**/*.md`，纯 markdown 提交不触发构建/部署；
- `deploy-docs.yml` 只监听 `docs/**`，本目录不在其中；
- 台账只写 `.md`，不动 `backend/`、`frontend/`、`docs/`。

## 节奏

| 时间（CST） | 类型 | 说明 |
|---|---|---|
| 03:10 05:10 09:10 11:10 13:10 15:10 17:10 19:10 21:10 23:10 | snapshot | 站点快照（文章/热点/提示词/AIHOT/流水线/备份/访问） |
| 00:10 04:10 20:10 | pipeline | 仅当热点流水线有新归档时提交，最多 3 次/天 |

合计 10–13 次/天。

## 内容来源

- `blog.db`（只读 `mode=ro`）：文章、热点、提示词、评论、`daily_stats`
- `/var/www/blog/dist/data/ai-daily-index.json` 与 `ai-daily/`：AIHOT 拉取状态
- `/data/blog/logs/hotspot-pipeline-cron.log`：最近一次流水线 run
- `/data/blog/data/pipeline/hotspot_queue/{archive,failed}`：队列计数
- `/data/blog/backups/*.db`、`/data/blog/nas-export/status.json`：备份与 NAS 导出

## 部署位置（服务器）

- 脚本：`/data/blog/scripts/activity_commit.py`（源文件在本仓库 `scripts/ops/activity_commit.py`）
- 专用克隆：`/data/blog/ops-repo`（不与 `repo-tmp` 混用，避免被 CI 的 `reset --hard` 影响）
- 状态：`/data/blog/state/activity-state.json`；补发队列：`/data/blog/state/activity-pending/`
- 日志：`/data/blog/logs/activity-commit.log`
- 调度：`/etc/cron.d/blog-activity`

## 手动操作

```bash
# 只打印，不写不提交
/usr/bin/python3 /data/blog/scripts/activity_commit.py --slot snapshot --dry-run

# 立即提交一次
/usr/bin/python3 /data/blog/scripts/activity_commit.py --slot snapshot --force

# 停用（回滚）
rm -f /etc/cron.d/blog-activity
```

## 注意

- 提交作者固定 `Qian Xi <1964055097@qq.com>`（与 GitHub 账号关联，贡献才计入）；
- 推送失败会把条目落到 `state/activity-pending/`，下次运行自动补发；
- 如果以后仓库启用分支保护，需要把台账改成走 PR 或给机器人开白名单。
