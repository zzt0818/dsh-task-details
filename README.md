# 任务详情侧边栏（DSH 插件）

[English](./README.en.md) · 中文

在每个对话任务的最下方显示 **「查看任务详情」**，点开后从右侧边栏打开该任务的详情面板；面板宽度可以拖拽调整，拉宽后文件行会展开成完整明细（保存路径、日期、大小、行数、是否存在）。

一句话说明它解决什么：**任务跑完之后，你不需要往上翻聊天记录，就能看到这次任务到底读了什么、改了什么、用了哪些工具、烧了多少 token。**

面板内容：

| 区块 | 实现 |
|---|---|
| 查看任务详情 | 任务底部的按钮（`conversation.chat.turnTail` 槽） |
| 输入的文件 | 本任务读取过的文件 + 用户消息文本 + 附件名；没有时显示「暂无」 |
| 中间产物 | 临时/构建/`.dsh` 目录下的文件、`MEMORY.md` 记忆文件、会话日志（`.jsonl.zstd`） |
| 输出的文件/产物 | 本任务写入或交付的文件，可点开预览 |
| 使用的工具/skill | 工具调用次数、失败次数、平均耗时；`skill` 调用单列 |
| 使用的语言或其他 | 从文件扩展名推断的语言、执行的 shell、命令次数 |
| 可复用/生成本地技能/工具？ | 依据交付文件、脚本产出、技能调用、项目改动给出结论 |
| 对话任务的流程/框架 | 按步骤组织的时间线（每个工具调用一行，失败标红） |
| 模型的提供方、模型名称、用量、缓存输入输出 | 提供方/模型、输入/输出/缓存读/缓存写/推理 Token、缓存命中率与进度条 |

## 安装

```sh
dsh plugin add dsh-task-details
```

安装后**重启 DeepSeek Harness 桌面应用**。重新打开任意历史任务，任务底部就会出现「查看任务详情」。

从源码安装（开发时）：

```sh
git clone https://github.com/zzt0818/dsh-task-details.git
dsh plugin add link:./dsh-task-details
```

## 开发

```sh
npm run build    # 把各模块内联成单一 client.js（浏览器端产物）
npm test         # 跑全部测试
```

`client.js` 是构建产物，由 `build.mjs` 生成，**不要手改**。

单独跑某一个测试：

```sh
node test/analyzer.test.mjs     # 分析器：会话日志按任务聚合
node test/fold.test.mjs         # 折叠：任务划分、无幻影任务、耗时
node test/host.test.mjs         # Host 聚合：文件存在性/大小/行数
node test/host-plugin.test.mjs  # Host 路由：405/400/200 与 dispose
node test/bundle.test.mjs       # 浏览器端：模块加载器格式、槽位注册
node test/render.test.mjs       # 渲染：跑通完整面板树
```

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半：`POST /api/plugins/ui-task-details/describe` 与 `GET .../journal`，返回文件元数据、记忆文件、会话日志 |
| `analyzer.js` | 纯函数：把会话事件流按任务（Turn）折叠成输入/工具/用量/文件 |
| `model.js` | 地址格式、格式化、语言推断、可复用判断 |
| `details.js` | 面板视图（含拖拽调宽）与任务底部按钮 |
| `preference.js` | 面板宽度偏好（跨标签页共享） |
| `styles.js` | 样式（全部使用宿主 `--dsw-alias-*` 主题变量） |
| `copy.js` | 中英文案 |
| `client-entry.js` | 浏览器端注册逻辑（槽位、标签页类型、样式、词典） |
| `client.js` | **构建产物**，由 `build.mjs` 生成 |
| `cordis.patch.yml` | bundle patch：插入 Host 插件行 |
| `icon.svg` / `locale/*.json` | 插件图标与显示元数据 |

## 设计要点

- **数据来源是会话日志**：面板直接读取 `sessions.binding(id).session.eventSource`，与 Chat 折叠无关，所以被折叠掉的工具调用也能看到；重新打开历史任务、断线重连后依然正确。
- **Host 只补浏览器看不到的信息**：文件是否仍存在、大小、修改时间、行数，以及 `.dsh` 下的记忆与日志位置。
- **宽度自适应**：默认 460px；≥560px 时文件行展开明细；≥700px 时面板内部变为双栏。宽度写入 `localStorage`，所有详情标签页共享。
- **跟随主题**：颜色全部取宿主 token，亮/暗模式自动适配。

## 已知边界

- 输入端只统计「工具读取过的文件」和消息附件；用户在系统里直接改的文件不会被记录，这是会话日志的固有边界。
- 面板只包含已加载的会话窗口；更早的任务需要先在 Chat 里向上翻页加载。
- 工具结果里的文件路径依赖 `<path>` 标记与 `file_path`/`path` 参数；纯命令行里 `>` 重定向生成的文件无法静态识别，会归入「未见路径」而不是伪造一条记录。

## 许可证

[MIT](./LICENSE)
