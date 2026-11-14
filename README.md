# OneBot 11 for LuckyLillia

为 LuckyLillia 的 NTQQ 账号提供 OneBot 11 接口，支持 HTTP API、HTTP SSE、正向 WebSocket、反向 WebSocket 和 HTTP POST 事件上报，保留 go-cqhttp 与 LLOneBot 扩展动作。

## 安装与配置

在 LuckyLillia 插件页安装并启用 `@luckylillia/plugin-nt-protocol`，登录 QQ，再安装并启用 `@luckylillia/plugin-onebot11`。此插件需要支持独立 NTQQ 插件的 Bot 版本；不支持 QQ 开放平台官方机器人。

打开 OneBot 11 插件的设置页，添加连接并保存。可以同时配置多条连接，每条连接有独立的 Token、消息格式、自身消息 / 离线消息上报开关和事件过滤器。HTTP 与正向 WebSocket 默认监听本机；监听全部地址时需要填写 Token。

插件配置示例：

```json
{
  "connect": [
    {
      "type": "http",
      "enable": true,
      "host": "127.0.0.1",
      "port": 3000,
      "token": "your-access-token",
      "messageFormat": "array",
      "reportSelfMessage": false,
      "reportOfflineMessage": false,
      "debug": false
    }
  ]
}
```

插件本身的启用状态由插件列表控制，配置里不需要另填顶层 `enable`。停用或更新插件会关闭其连接；NTQQ 账号及其他使用 NTQQ 的插件继续运行。

## 接口与依赖

通过 HTTP `POST /get_login_info` 或 WebSocket 的 `get_login_info` 动作可检查账号。支持 `get_event` HTTP 轮询与 `.handle_quick_operation` 快速操作。`get_config` / `set_config` 调用宿主提供的配置接口；各实例的配置仍由宿主管理。

NTQQ 的账号动作由 NTQQ 插件提供。因此其他插件调用 `bot.internal` 时，无需启用本插件的 HTTP / WebSocket 连接。音频转码、Silk 转换或视频处理等需要媒体能力的动作仍需安装可选 FFmpeg 插件；不需要转换的动作可以独立使用。

## 开发

本仓库独立构建，不依赖 Bot 源码。Node.js 22.15 或更高版本：

```sh
npm install
npm install --no-save @luckylillia/plugin-nt-protocol@^1.0.0
npm run check
npm test
npm run build
```

联调 NTQQ 源码时，可把上述第二条命令的包名换成其 `npm pack` 生成的 tarball。构建仅打包 NTQQ 的公开消息模型和转换函数；原生模块与账号资源由运行中的 NTQQ 插件持有。WebUI 单独生成脚本和样式，运行时使用宿主的 React 和插件 SDK。
也可以先在 NTQQ 仓库构建，再运行 `node scripts/use-ntqq.mjs <NTQQ仓库路径>`，仅连接本地 `node_modules`，不修改包清单或 lockfile。

`test/unit` 使用模拟账号和本机临时端口验证协议，无需启动 QQ。`test/api` 是需要真实账号、好友和群配置的手动联调套件，不会在 `npm test` 中执行。

## 自动发布到 npm

`.github/workflows/publish.yml` 使用 GitHub Actions 的 OIDC 身份发布，无需设置 npm Token。先在 npm 包 `@luckylillia/plugin-onebot11` 的 **Settings → Trusted Publisher** 中选择 GitHub Actions，填写：

| 字段 | 值 |
| --- | --- |
| Organization or user | `LuckyLilliaDev` |
| Repository | `lucky-lillia-plugin-onebot11` |
| Workflow filename | `publish.yml` |
| Environment name | 留空 |

更新 `package.json` 与 `package-lock.json` 的版本并提交后，推送同名的 `v<版本号>` 标签，例如 `v1.0.2`，即可触发发布。标签必须与包版本完全一致，已发布的版本不能覆盖；稳定版本发布到 `latest`，带预发布后缀的版本发布到 `next`。也可以在 Actions 的 **Publish to npm → Run workflow** 中选择 `main`；默认勾选 `dry_run`，只检查、测试、构建并上传 `.tgz` 产物，取消勾选才会发布当前版本。

发布 CI 固定使用 NTQQ 提交 `cea358c3db1f7c639ba30450939212d338e4576e`（1.0.1）构建公开 API，不受其 npm 暂存审核或 `main` 后续改动影响；需要采用新的 NTQQ API 时更新工作流中的该提交并验证。NTQQ 只链接到开发依赖目录，不会写入包清单或进入 OneBot 发布包。CI 仅运行模拟账号的单元测试，不启动真实 QQ。

校验通过的同一个 tarball 会作为 Actions artifact 保存，并由单独的发布任务校验 SHA-512 后以公开包和 provenance 发布。发布后还会检查 npm 的公开版本、tag 和包校验值；如果 npm 仍处于暂存审核，任务会明确报错，需等待自动审核结束再到 npm 的 **Staged Packages** 批准，不要直接重发同一个版本。

## CI 与真实账号集成测试

`.github/workflows/test.yml` 在提交和 PR 时构建 NTQQ 源码，再检查、测试和构建 OneBot。默认使用 `LuckyLilliaDev/lucky-lillia-plugin-ntqq-protocol` 的 `main` 分支，可用仓库变量 `NTQQ_REPOSITORY` / `NTQQ_REF` 指定源码仓库和版本；手动运行工作流时可以填写对应输入。

真实账号测试由手动工作流的 `run_e2e` 启动，需要标签为 `llbot-test` 的 Linux Docker runner。Bot 的宿主集成 CI 也调用同一套脚本与测试。完整套件同时安装独立 NTQQ、OneBot 和可选 FFmpeg 插件；使用两个独立实例的 `plugins.json`，不依赖原来的内置协议。

本地运行时设置 `BOT_DIR`、`NTQQ_PLUGIN_DIR`、`FFMPEG_PLUGIN_DIR` 指向相应源码目录，以及 `QQ_BASE_IMAGE` 指向带 `/opt/QQ/qq` 的 QQ 基础镜像。Bot 需要预先执行 `npm run build` 与 `npm run build-webui`。然后在 Linux 下依次运行：

```sh
trap 'bash scripts/native-e2e.sh stop' EXIT
for step in prepare build start wait test; do
  bash scripts/native-e2e.sh "$step" || exit
done
```

`prepare` 构建并打包本次源码，生成隔离配置；只有 `start` 才启动真实 QQ。默认凭据目录是 `/srv/llbot-test`，读取 `auth_token1.txt` / `auth_token2.txt`；登录缓存使用 `llbot-test_qq_volume1` / `llbot-test_qq_volume2`，网络是 `llbot-test_test_network`。可用 `E2E_AUTH_DIR`、`E2E_NETWORK`、`E2E_PRIMARY_QQ`、`E2E_SECONDARY_QQ`、`E2E_GROUP_ID` 覆盖测试环境。产物和报告位于 `E2E_ROOT`（默认 Bot 的 `output/onebot-e2e`）。

测试 runner 的系统 FFmpeg 只生成新的视频样本；Bot 处理媒体仍走原生插件。样本和临时文件在 runner 与 Bot 容器中使用相同路径。等待阶段校验账号身份并在超时报错，测试失败会使工作流失败。
