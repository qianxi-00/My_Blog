# 宿主 cron 配置留档（三十五期）

`/etc/cron.d/` 下的文件**不在 git 仓库里**（它们是宿主配置，不随 CI 部署）。
这里留一份副本，便于：
- 换机/重建时照抄回来
- 审阅"发布排期"到底是怎么定的
- 出现"任务没跑"时对照排查

## hotspot-pipeline（发布文章的定时任务）

| 时间（上海） | 模式 | 说明 |
|---|---|---|
| 19:20 | `hot hot` | AIHOT 热点选题，论文优先 |
| 23:20 | `curriculum 1900` | 注意力 / KV Cache / 推理加速线 |
| 03:20 | `curriculum 2000` | 预训练 / 数据 / scaling law 线 |

**三十五期**把原来分散在 09:20 / 19:20 / 21:20 的三次全部挪进
**19:00 ~ 次日 07:00** 的夜间窗口，间隔 4 小时。

理由与约束：
- 单次实测耗时 **1h02m ~ 2h25m**（见 AGENTS.md 三十五期），4 小时间隔
  > 最长耗时，不会自己撞自己
- 03:20 那次约 05:45 前跑完，仍在窗口内
- 锁的死锁阈值同步从 30 分钟改成 3 小时（`LOCK_STALE_SECONDS`）——
  否则任务跑到 30 分钟时会被下一个 cron 判成"死锁残留"删掉锁，
  导致两个 pipeline 并发跑

**没有挪动的任务**（它们不发布文章）：
- `blog-ai-daily`（每 30 分钟）——拉外部 AIHOT 日报生成静态 JSON，不写库
- `hotspot-tagging`（03:17）——只补 `topic_tag`（幂等、只补 NULL）
- `blog-backup`（04:30）、`blog-coze-sync`（05:10）——备份与提示词同步
- `push_figures_watch.sh`（每 2 分钟）——推论文配图到图床

## 部署方式
```bash
cp ops/cron/hotspot-pipeline /etc/cron.d/hotspot-pipeline
chown root:root /etc/cron.d/hotspot-pipeline
chmod 644 /etc/cron.d/hotspot-pipeline
systemctl reload cron
```
