# CheckIn

个人日程打卡应用：日程时间轴规划、每日打卡、日历、月度时间统计。单密码登录，数据存 Cloudflare D1，多端同步，断网时自动回退本地缓存。

## 功能

- **日程计划**：展示模式查看当天清单（可勾选完成）；编辑模式在时间轴上拖选新建、就地输入（回车连续录入多条事项）、点击块编辑、拖动边缘或下拉调整时间；工作/学习/运动/生活/娱乐五种类型五色区分
- **打卡**：固定事项每日打卡，连续天数 / 累计 / 完成率 / 最近 7 天统计
- **日历**：农历与法定节假日（休/班），点选任意日期查看编辑当天日程
- **本月统计**：按已完成事项折算的各类型时长分配
- **登录**：单密码 + JWT 会话（30 天），登录限流防爆破

## 项目结构

```
├── src/                    # Cloudflare Worker（Hono）
│   ├── index.js            # 路由入口
│   ├── api/
│   │   ├── login.js        # 密码登录：限流、恒时比较、签发 JWT
│   │   └── state.js        # 应用状态读写（需认证）
│   └── lib/
│       ├── auth.js         # 认证中间件（JWT + 会话 nonce）
│       ├── jwt.js          # HS256 签发/校验
│       ├── schema.js       # D1 建表
│       ├── config.js       # 会话时长、限流参数
│       └── utils.js        # 通用工具
├── public/                 # 静态前端（Workers Assets 托管）
│   ├── app.html            # 页面壳（登录层 + 主界面）
│   ├── app.css             # 样式
│   └── modules/            # ES Modules
│       ├── app.js          # 入口：登录流程、启动、定时器
│       ├── ctx.js          # 共享状态 S 与渲染注册表 R
│       ├── util.js         # 常量与纯函数
│       ├── ui.js           # toast、两步删除确认
│       ├── auth.js         # 客户端会话与认证请求
│       ├── store.js        # 数据仓库：本地缓存 + 云端防抖同步
│       ├── planner.js      # 日程（展示/时间轴编辑/就地编辑器）
│       ├── checkin.js      # 打卡
│       ├── calendar.js     # 日历
│       └── stats.js        # 本月统计
├── scripts/deploy-build.mjs  # 部署脚本：自动解析/创建 D1、同步密钥
└── wrangler.toml
```

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
