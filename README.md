# 日程笔记

个人日程与笔记应用：日程时间轴规划、日历、月度时间统计、常用笔记。单密码登录，数据存 Cloudflare D1，多端同步，断网时自动回退本地缓存。

## 功能

- **日程计划**：展示模式查看当天清单（可勾选完成）；编辑模式在时间轴上拖选新建、就地输入（回车连续录入多条事项）、点击块编辑、拖动边缘或下拉调整时间；工作/学习/运动/生活/娱乐五种类型五色区分
- **常用笔记**：点开即读，点「编辑」就地改成富文本（加粗/斜体/下划线/删除线、H1/H2、引用、有序无序列表、撤销重做），保存后自动同步；不含图片、视频等上传能力
- **日历**：农历与法定节假日（休/班），点选任意日期查看编辑当天日程
- **本月统计**：按已完成事项折算的各类型时长分配
- **离线可用**：注册 Service Worker，断网仍能打开页面并用本地缓存继续编辑，恢复网络后自动补推
- **登录**：单密码 + JWT 会话（2 天，使用中自动续期），登录限流防爆破

## 数据与同步

- 存储按实体拆分：笔记一条一行、日程一天一行、时间范围等元信息按键存，任何编辑只写改动的那部分
- 每条记录带 `rev` 版本号，写入时校验；版本落后会返回 409，客户端用最新版本号重试，避免两台设备互相覆盖
- 同一秒内多次编辑合并成一次请求；断网时只写本地缓存，恢复后再补推
- 删除笔记为软删除（`deleted_at`），内容仍保留在库里，可从备份中找回
- 单行解析失败不会被当成"没有数据"：坏行会原样写入 `corrupt_rows` 表，其余数据照常返回

### 备份与恢复

登录后可直接在浏览器打开 `/api/backup` 下载完整 JSON（含已删除笔记）。

```bash
# 恢复（会整库覆盖，必须显式 confirm）
curl -X POST https://<worker>/api/backup/restore \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: <token>" -H "X-Session-Nonce: <nonce>" \
  -d "$(cat notes-backup-2026-10-28.json | jq '. + {confirm:"replace"}')"
```

## 项目结构

```
├── src/                    # Cloudflare Worker（Hono）
│   ├── index.js            # 路由入口
│   ├── api/
│   │   ├── login.js        # 密码登录：限流、恒时比较、签发 JWT
│   │   ├── state.js        # 状态读写：笔记按条、日程按天、元信息按键
│   │   └── backup.js       # 整库导出与覆盖式恢复
│   └── lib/
│       ├── auth.js         # 认证中间件（JWT + 会话 nonce）
│       ├── jwt.js          # HS256 签发/校验
│       ├── schema.js       # D1 建表（notes / plans / app_meta / corrupt_rows）
│       ├── validate.js     # 请求体校验（纯函数，可单测）
│       ├── config.js       # 会话时长、限流参数
│       └── utils.js        # 通用工具
├── public/                 # 静态前端（Workers Assets 托管）
│   ├── app.html            # 页面壳（登录层 + 主界面）
│   ├── app.css             # 样式
│   ├── _headers            # 静态资源缓存策略
│   ├── manifest.webmanifest # PWA 清单
│   ├── sw.js               # Service Worker：离线打开、接口不缓存
│   ├── icons/              # 应用图标
│   ├── assets/             # 第三方库（Squire、SweetAlert2、农历库）
│   └── modules/            # ES Modules
│       ├── app.js          # 入口：登录流程、启动、定时器
│       ├── ctx.js          # 共享状态 S 与渲染注册表 R
│       ├── util.js         # 常量与纯函数
│       ├── icons.js        # Remix Icon 内联图标
│       ├── ui.js           # toast、两步删除确认
│       ├── auth.js         # 客户端会话与认证请求
│       ├── store.js        # 数据仓库：本地缓存 + 增量同步 + commit 入口
│       ├── planner.js      # 日程（展示/时间轴编辑/就地编辑器）
│       ├── notes.js        # 常用笔记（列表与交互）
│       ├── note-editor.js  # 笔记富文本编辑器（Squire）
│       ├── note-format.js  # 笔记内容清洗与展示辅助
│       ├── calendar.js     # 日历
│       └── stats.js        # 本月统计
├── tests/                  # node:test 单元测试
├── types/                  # 全局类型补充（JSDoc 检查用）
├── jsconfig.json           # checkJs 类型检查配置
├── .github/workflows/ci.yml # CI：测试 + 类型检查 + 语法检查
├── scripts/deploy-build.mjs  # 部署脚本：自动解析/创建 D1、同步密钥
└── wrangler.toml
```

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入 APP_PASSWORD / JWT_SECRET
npm run dev                      # http://127.0.0.1:8787
npm test                         # 单元测试
npm run typecheck                # JSDoc 类型检查
```

D1 表结构在首次访问时自动创建（`notes` / `plans` / `app_meta` / `corrupt_rows`）。

## 部署（Cloudflare Workers）

## GitHub 连接自动部署（推荐）

1. 把本仓库推到 GitHub
2. Cloudflare Dashboard → Workers & Pages → Create → 连接该 GitHub 仓库
3. 部署配置：
   - **Deploy command**: `npm run deploy`
   - **Variables and Secrets**（构建环境变量）：
     - `APP_PASSWORD` — 登录密码
     - `JWT_SECRET` — 随机长字符串（如 `openssl rand -hex 32` 生成）
4. 部署脚本会自动查找/创建名为 `checkin-db` 的 D1 数据库并注入 ID，同时把两个密钥同步为 Worker 运行时 Secret——`database_id` 与密钥都不需要提交进仓库
