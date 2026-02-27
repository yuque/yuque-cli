# Yuque CLI

一个基于 Node.js 的语雀命令行工具，提供沉浸式交互 REPL。

主要能力：
- 常驻 Banner 的应用式界面
- 键盘优先的交互体验
- 知识库与文档的表格/列表选择
- 文档 `open`（浏览器打开）和 `show`（终端展示）
- Markdown 分页预览
- 文档创建时的多行正文编辑器

English docs: [`README.md`](README.md)

## 功能特性

- 支持 `YUQUE_TOKEN` 环境变量和交互式登录
- 丰富键盘交互（翻页、选择、确认、取消）
- 支持命令补全与建议下拉
- 语雀 namespace 列支持终端可点击链接（OSC8 终端）
- 提示文案友好，错误反馈更可操作
- `create doc in [repo]` 使用多行编辑器输入正文

## 环境要求

- Node.js >= 18

## 安装

全局安装当前源码：

```bash
npm run install:global
```

本地开发建议使用软链接：

```bash
npm run link:global
```

验证：

```bash
yuque --version
```

## 鉴权

- 环境变量：`YUQUE_TOKEN`
- 或在 REPL 中执行：`auth login`

Token 默认保存位置：

```text
~/.yuque/settings.json
```

创建 Token 页面：

```text
https://www.yuque.com/settings/tokens
```

## 使用

```bash
yuque
```

或执行单次命令：

```bash
yuque whoami
yuque list repos
yuque list docs <repo>
yuque open <repo>/<doc>
yuque show <repo>/<doc>
yuque search "keyword" <repo>
```

## REPL 命令

```text
help
clear
exit | quit
auth login
auth logout
whoami
list repos
list docs [repo]
use <repo>
open <repo>/<doc>
show <repo>/<doc>
search <kw> in [repo]
search <kw>
create doc in [repo]
```

## 环境变量

- `YUQUE_TOKEN`：语雀 token
- `YUQUE_ENDPOINT`：自定义 API 地址（默认 `https://www.yuque.com`）

## 开发

```bash
npm test
npm run repl
```

## License

MIT
