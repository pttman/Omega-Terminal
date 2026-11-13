# Omega Terminal

面向 Windows 的个人桌面终端。统一使用本地 PowerShell 与 SSH，提供拖拽上传、随行助手和内置命令手册。

当前版本：0.1.0 开发预览版。产品设计与尚待完成的范围见 [产品需求文档](docs/产品需求文档.md)，实际交付情况见 [实现与验证记录](docs/实现与验证记录.md)。

## 直接使用

从 [GitHub Releases](https://github.com/pttman/Omega-Terminal/releases) 下载 `Omega-Terminal-0.1.0-win-x64.zip`，完整解压后打开 `Omega Terminal.exe`。请保留解压后的整个文件夹，其中包含运行依赖。面向 Windows 11 x64，预览版免安装、未签名。

同时提供 `SHA256SUMS.txt`，可用 `Get-FileHash .\Omega-Terminal-0.1.0-win-x64.zip -Algorithm SHA256` 核对下载完整性。

本地终端：点击首页的 Windows PowerShell 卡片。本地仅保留此入口，旧的 PowerShell 7 / CMD 默认设置自动迁移到 Windows PowerShell。原生终端支持直接输入；底部命令栏提供应用补全、命令编辑及 AI/手册填入。按 Enter 执行命令栏中的实际内容。

分屏：拖动顶部会话标签或分屏标题，到另一个终端的左、右、上、下边缘，看到预览后松开即可移动已有会话；最多四个分屏，可组合左右与上下布局。拖动分隔线调整比例，双击恢复均分；聚焦分隔线后也可使用方向键调整、Home 恢复均分。拖动时悬停其他标签可切换目标；拖到顶栏“松开以独立标签”区域可将分屏拆成独立标签。原连接、输出和输入草稿会保留。

远程连接：点击“新建连接”，填写主机与认证方式。连接前先检测地址与 SSH 服务，平滑进度条显示实际阶段；连通后再输入密码或私钥口令，并核对主机指纹。密码页提供“保存并连接”和“直接连接”：前者在认证成功后使用 Windows 系统加密保存在本机，下次可直接连接，后者不保存本次密码。编辑连接中可以清除密码；修改地址、端口、用户名或认证方式后旧密码自动清除。私钥口令只用于此次连接。较小窗口中的表单可以滚动。

SSH Bash 终端在初始化完成后显示干净的提示符，初始化脚本不会刷屏；服务器欢迎信息、最近登录等收在右上角可展开的“登录信息”中。后续命令输出正常显示，不修改远端登录配置。

连接进度按实际已完成的阶段平滑推进，快速预检约用 1.5 秒呈现完整过渡；较慢的网络仍按实际耗时等待，取消和失败即时响应。系统启用减少动态效果时跳过这段展示延迟。

上传：从文件资源管理器拖一个或多个文件到 SSH 终端区域，上传至可靠识别的工作目录；未识别时先选择目录。也可以在连接配置中设置固定上传目录。右下角查看进度、取消或重试。默认展示最近 3 条，展开后在固定高度内滚动。文件夹上传尚未实现。

AI：打开“设置 → AI 服务”，填写兼容 Chat Completions 格式的基础地址、模型名与凭据。本机模型可使用 localhost HTTP；远程服务使用 HTTPS。需要自行准备可用服务，未内置付费凭据。助手生成建议后点击“填入原会话”，检查后按 Enter 执行。

手册：不配置 AI 也能使用；包含 PowerShell、CMD 和 Linux Bash 的常用任务示例。选择条目、填写参数，再复制或填入。

缩放：鼠标置于终端，Ctrl + 滚轮调整该分屏字号；Ctrl+0 恢复默认。普通滚轮仍滚动终端。

外观菜单、登录信息和传输面板在鼠标离开 1 秒后收起，移回可取消收起。右下角版本号可打开关于信息；有活动会话或传输时，退出会显示随主题变化的应用内确认弹窗。

## 开发

建议使用 Node.js 24 LTS、npm 与 Windows 11 x64。本项目锁定依赖版本，使用 Windows ConPTY。

```powershell
npm ci
node node_modules/electron/install.js
npm run dev
```

Electron 45 需要单独下载运行文件；若下载失败可按本机网络环境配置 Electron 官方支持的镜像，再执行安装命令。

```powershell
npm run build
npm start
npm test
npm run test:desktop
npm run test:ui-credentials
npm run test:split
npm run test:motion
npm run test:app-dialogs
npm run pack
npm run test:packaged
```

`test:desktop` 会打开隔离的测试窗口，并创建仅绑定 127.0.0.1 的 SSH/SFTP 与 AI 测试服务；不会连接用户的真实服务器或真实模型。报告与截图位于 `test-results/`。

开发配置保存在项目 `.local-data/`；打包版配置保存在 Windows 用户应用数据目录下。API 凭据与用户选择记住的 SSH 密码通过 Electron safeStorage 使用 Windows 系统保护；普通配置导出不包含凭据、私钥路径和信任记录。聊天与当前会话命令历史只保存在内存。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `electron/` | 桌面窗口、受限 IPC、本地 PTY、SSH/SFTP、配置与 AI 适配 |
| `src/` | React 界面、xterm.js 终端、命令输入栏、手册与助手 |
| `src/shared/manual.json` | 离线命令条目与适用 Shell |
| `tests/` | 命令引用、配置、真实 PTY、SSH/SFTP、AI 服务测试 |
| `scripts/desktop-test.mjs` | Electron 界面与原生文件拖放端到端验证 |

## 目前边界

- 应用候选补全位于底部命令输入栏；直接在原生终端输入时由 Shell 提供原生补全。尚未把应用候选菜单嵌入所有 Shell 的原生编辑缓冲区。
- SSH Bash 会话会加载仅当前会话有效的提示符函数以获取目录与就绪状态，不修改服务器文件。受限服务器或其他远程 Shell 可能只支持原生终端；无法确认空白提示符时，命令栏不自动投递。
- 参数补全目前是有限的静态规格；远程命令名候选是常用命令目录，不能证明对应工具已安装；路径候选通过本机文件系统或同连接 SFTP 查询。
- 跳板机、SSH Agent、端口转发、文件夹上传、下载面板、断点续传、工作区恢复、自定义快捷键编辑尚未实现。
- 尚未在真实生产服务器、长时间压力、高 DPI 多档和中文输入法组合中完成全面验收。AI 接口用本机测试服务验证，真实供应商仍需接入测试。
- Windows 预览包未签名；未提供自动更新或正式安装程序。

## 打包与发布

运行 `npm run release:zip` 生成 `artifacts/Omega-Terminal-0.1.0-win-x64.zip` 与 `SHA256SUMS.txt`。发布范围与检查步骤见 [发布说明](docs/发布说明.md)。源码仓库只保留构建所需的代码、资源、锁文件、测试与文档。
