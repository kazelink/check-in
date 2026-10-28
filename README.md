# Check_In

个人日程与笔记应用。日程时间轴、日历、常用笔记、月度统计；单密码登录，数据存 Cloudflare D1，多端增量同步，断网可继续编辑。

## 功能

- 日程：按天规划，时间轴拖选新建、就地编辑、拖动调整，支持五类分色与勾选完成
- 笔记：点开即读，就地富文本编辑（加粗、斜体、列表、引用），不含图片视频
- 日历：农历与法定节假日，点选日期切换当天日程
- 统计：按已完成事项折算各类型时长
- 离线：Service Worker + 本地缓存，恢复网络后自动补推

## 技术要点

- 前端原生 ES Modules，无构建步骤；Squire 富文本、Remix Icon
- Worker（Hono）+ D1；密码登录，JWT 2 天滑动续期
- `notes` 按条、`plans` 按天、`app_meta` 按键存储，每条带 `rev`，写入校验版本
- 笔记软删除；解析失败的坏行写入 `corrupt_rows`，不影响其余数据

## 开发

```bash
npm install
cp .dev.vars.example .dev.vars   # 填 APP_PASSWORD / JWT_SECRET
npm run dev                      # http://127.0.0.1:8787
npm test
npm run typecheck
```

## 部署

```bash
export APP_PASSWORD='登录密码'
export JWT_SECRET="$(openssl rand -hex 32)"
npx wrangler login
npm run deploy
```

GitHub 连接部署：Deploy command 填 `npm run deploy`，构建变量加 `APP_PASSWORD`、`JWT_SECRET`。脚本会自动创建或复用 `checkin-db` 并注入 `database_id`。

上线后访问 `/api/health`（需登录）确认数据库状态：返回 `{"ok":true,"db":true,"tables":[...]}` 表示正常；`D1 binding missing` 说明 Worker 没有绑定数据库。

## 备份

登录后访问 `/api/backup` 下载 JSON；`POST /api/backup/restore` 整库恢复，请求体需带 `"confirm":"replace"`。

删除的笔记先软删除并保留 7 天（备份里带 `deletedAt`，期间可恢复），超过 7 天由 `/api/state` 在下次访问时物理清除。

## 目录

```
src/      Worker：api（login / state / backup）、lib（auth / jwt / schema / validate / meta）
public/   前端：app.html、app.css、modules/、assets/、sw.js、manifest
tests/    node:test 单元测试
types/    JSDoc 类型补充
```
