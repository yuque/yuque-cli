<div align="center">

<a href="https://www.yuque.com/"><img src="https://avatars.githubusercontent.com/u/34602419?s=200&v=4" width="96" alt="语雀 logo"></a>

<h1>Yuque CLI</h1>

在终端里直接使用你的[语雀](https://www.yuque.com/)知识库 ——<br>搜索、阅读、写作、管理，一条命令搞定。

[![CI][ci-image]][ci-url] [![npm version][npm-image]][npm-url] [![npm downloads][download-image]][download-url] [![License][license-image]][license-url]

[快速开始](#快速开始) · [命令列表](#命令列表26-个) · [脚本化](#输出与脚本化) · [常见问题](#常见问题) · [English](./README.md)

</div>

完成认证后，知识库触手可及：

```bash
yuque search "灰度发布" --type doc                 # 找回那篇只记得大概的文档
yuque doc get team/handbook onboarding > onboarding.md
yuque doc create team/notes --title "周会纪要" --body-file weekly.md
yuque repo list my-team --group --all --json | jq '.[].name'
```

## 快速开始

**第一步：获取 Token** —— 前往[语雀开发者设置](https://www.yuque.com/settings/tokens)创建个人访问令牌。如果使用绑定空间的团队 Token，记下空间地址（例如 `https://your-space.yuque.com`），稍后通过 `--host` 或 `YUQUE_HOST` 传入。

**第二步：安装并登录：**

```bash
npm install -g @yuque/cli
export YUQUE_TOKEN=YOUR_TOKEN
yuque auth status
```

<details>
<summary><b>免安装运行（npx）</b></summary>

```bash
YUQUE_TOKEN=YOUR_TOKEN npx @yuque/cli auth status
```

</details>

**第三步：开始探索** —— 先 `yuque repo list your-login`，再 `yuque doc list <repo>`。

## 配置

| 配置项             | 环境变量 / 命令行参数     | 说明                                                                                         |
| ------------------ | ------------------------- | -------------------------------------------------------------------------------------------- |
| Token **（必填）** | `YUQUE_TOKEN` / `--token` | 语雀个人或团队 API Token（同时兼容读取 `YUQUE_PERSONAL_TOKEN`，可与 @yuque/mcp-server 共用） |
| Host（可选）       | `YUQUE_HOST` / `--host`   | 站点或空间地址，例如 `https://your-space.yuque.com` —— 绑定空间的团队 Token 和私有化部署必填 |

命令行参数优先于环境变量，随手 `--token` 覆盖一次总是生效。站点地址会自动规范化（自动补 `/api/v2`）；不设置时默认 `https://www.yuque.com`。

## 命令列表（26 个）

每条命令都对应[语雀 OpenAPI](https://www.yuque.com/yuque/developer/api) —— 映射关系由契约测试锁定在内置规格文件上。

| 分类       | 命令                                 | 说明                                                               |
| ---------- | ------------------------------------ | ------------------------------------------------------------------ |
| **认证**   | `ping`                               | 验证与语雀 API 的连通性                                            |
|            | `auth status`                        | 查看当前登录身份                                                   |
| **用户**   | `user info`                          | 查看当前 Token 对应的用户                                          |
|            | `user groups <user>`                 | 列出用户加入的团队                                                 |
| **搜索**   | `search <query>`                     | 搜索文档或知识库，支持分页                                         |
| **知识库** | `repo list <login>`                  | 列出用户或团队（`--group`）的知识库                                |
|            | `repo get <repo>`                    | 按 id 或 `owner/slug` 查看知识库                                   |
|            | `repo create <login>`                | 创建知识库                                                         |
|            | `repo update <repo>`                 | 更新名称、路径、简介、可见性或目录                                 |
|            | `repo delete <repo>`                 | 删除知识库 —— 需要确认                                             |
| **文档**   | `doc list <repo>`                    | 列出知识库中的文档，`--all` 拉取全量                               |
|            | `doc get <repo> <doc>`               | 输出文档 markdown 正文；也接受全局 `<doc-id>`，`--meta` 查看元信息 |
|            | `doc create <repo>`                  | 从 `--body` 或 `--body-file` 创建文档                              |
|            | `doc update <repo> <doc>`            | 更新文档正文或元信息                                               |
|            | `doc delete <repo> <doc>`            | 删除文档 —— 需要确认                                               |
|            | `doc versions <doc-id>`              | 列出文档的版本历史                                                 |
|            | `doc version <version-id>`           | 查看某个版本的内容                                                 |
| **目录**   | `toc get <repo>`                     | 以树形输出知识库目录                                               |
|            | `toc update <repo>`                  | 追加、头插、编辑或删除目录节点                                     |
| **团队**   | `group members <login>`              | 列出团队成员                                                       |
|            | `group member set <login> <user>`    | 添加成员或调整角色                                                 |
|            | `group member remove <login> <user>` | 移除成员 —— 需要确认                                               |
| **统计**   | `stats group <login>`                | 团队维度统计                                                       |
|            | `stats members <login>`              | 成员维度统计                                                       |
|            | `stats books <login>`                | 知识库维度统计                                                     |
|            | `stats docs <login>`                 | 文档维度统计                                                       |

知识库参数在所有命令中都同时接受数字 id 和 `owner/slug` 路径。各命令的完整参数见 `yuque <命令> --help`。

## 输出与脚本化

默认输出人类可读的表格与详情；任何命令加 `--json` 即输出完整 API 数据：

```bash
yuque doc list team/handbook --all --json | jq -r '.[].slug'
```

退出码保持稳定，脚本可以放心分支：

| 退出码 | 含义           |
| ------ | -------------- |
| `0`    | 成功           |
| `1`    | API 或未知错误 |
| `2`    | 用法错误       |
| `3`    | 认证错误       |
| `4`    | 资源不存在     |
| `5`    | 触发限流       |

管道输出时自动关闭颜色，也可用 `NO_COLOR=1` 强制关闭。限流与瞬时错误会自动退避重试后再失败。

## 写入权限

`create`、`update`、`delete` 命令会修改知识库中的真实内容，CLI 的能力边界就是你 Token 的能力边界。破坏性命令在终端交互时会要求确认，在脚本中必须显式传 `--yes`。请妥善保管 Token；只在单一空间内工作时，建议使用绑定空间的团队 Token（配合 `YUQUE_HOST`）。

## 常见问题

| 错误                                                  | 解决方案                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `A Yuque API token is required`                       | 设置 `YUQUE_TOKEN=YOUR_TOKEN` 或传入 `--token=YOUR_TOKEN`                                 |
| `token invalid or expired`（退出码 `3`）              | [重新生成 Token](https://www.yuque.com/settings/tokens)，或检查 `YUQUE_TOKEN` / `--token` |
| `rate limited by the Yuque API`（退出码 `5`）         | CLI 会自动重试；`--all` 循环请放慢节奏                                                    |
| `the requested resource does not exist`（退出码 `4`） | 检查知识库 id / `owner/slug` 路径以及文档 slug 是否正确                                   |
| 找不到 `npm` 命令                                     | 安装 [Node.js](https://nodejs.org/) v20 或更高版本                                        |

## 参与开发

```bash
git clone https://github.com/yuque/yuque-cli.git
cd yuque-cli
npm install
npm test              # 运行测试
npm run build         # 编译 TypeScript
npm run dev -- --help # 从源码运行
```

命令面由 [tests/spec-coverage.test.ts](./tests/spec-coverage.test.ts) 锁定在 [spec/yuque-openapi.yaml](./spec/yuque-openapi.yaml) 上；`npm run check` 是合并门槛。

## 相关链接

- [语雀 API 文档](https://www.yuque.com/yuque/developer/api)
- [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server) —— 通过 MCP 让 AI 助手使用同一个知识库
- [语雀 AI 生态](https://yuque.github.io/yuque-ecosystem/)

## 开源协议

[MIT](./LICENSE)

[ci-image]: https://img.shields.io/github/actions/workflow/status/yuque/yuque-cli/ci.yml?style=flat-square&label=CI
[ci-url]: https://github.com/yuque/yuque-cli/actions/workflows/ci.yml
[npm-image]: https://img.shields.io/npm/v/%40yuque%2Fcli?style=flat-square
[npm-url]: https://www.npmjs.com/package/@yuque/cli
[download-image]: https://img.shields.io/npm/dm/%40yuque%2Fcli?style=flat-square
[download-url]: https://www.npmjs.com/package/@yuque/cli
[license-image]: https://img.shields.io/github/license/yuque/yuque-cli?style=flat-square
[license-url]: ./LICENSE
