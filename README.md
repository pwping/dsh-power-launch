# dsh-power-launch

DeepSeek Harness（`dsh web`）的**安全启动 + 一键关机**伴侣插件（Windows）。

安装后它做三件事：

1. **Web UI 右下角电源按钮** —— 二次确认后让 dsh 宿主进程以退出码 0 干净退出（端口立即释放，下次启动不冲突），并自动关闭该浏览器标签页。
2. **桌面快捷方式（自动创建）** —— 每次 dsh 启动时幂等地在桌面确保一个带官方鲸鱼图标的 `DeepSeek Harness Web` 快捷方式存在，指向随插件分发的启动器。
3. **联网启动器** —— 点快捷方式即：关闭遗留端口 → 经国内镜像（npmmirror）检查 `@deepseek-ai/dsh` 新版本并按需更新 → 显示将要启动的版本 → 以隐藏后台进程启动 `dsh web`（无可见终端，不会被误关）→ 就绪后自动打开浏览器。

## 安装

```sh
# 从 npm（发布后）
dsh plugin --profile web add dsh-power-launch

# 从本地目录（开发调试）
git clone https://github.com/pwping/dsh-power-launch.git
dsh plugin --profile web add link:$(pwd)/dsh-power-launch
```

重启 `dsh web` 生效。之后日常使用只需双击桌面图标。

## 行为细节

- **关机按钮**：点击 → 弹出"确认退出？"→ 确认后 `POST /dsh-power-launch/api/shutdown`（要求自定义头 `x-dsh-power-launch: confirm`，防跨站触发）→ 宿主回 200 后 `process.exit(0)`。退出码 0 会被 dsh-doctor 监督器归类为"用户停止"，不会触发自动重启。
- **标签页关闭**：脚本调用 `window.close()`；浏览器只允许关闭"脚本自己打开"的标签页，若被拒绝则页面静默变为一块深色空白（不弹任何提示）。
- **桌面快捷方式**：目标为包内 `launcher/dsh-launch.bat`，图标为包内 `assets/dsh-whale.ico`。每次启动重写（自愈）：删了会补回、被改会纠正；改名或移动则视为你的选择，不再干预。
- **启动器窗口**：检查/更新阶段全程可见（能看到版本与进度），Web UI 就绪后 5 秒倒计时自动关闭。启动失败时窗口保留并打印日志尾部（日志在 `launcher/dsh-web.log`）。
- **联网失败**：镜像查询超时/失败不阻塞，降级用本地已安装版本启动。

## 配置

| 项 | 默认 | 修改方式 |
| --- | --- | --- |
| 端口 | `3080` | 快捷方式目标后加 `-Port 3081`，或命令行 `dsh-launch.bat -Port 3081` |
| npm 镜像 | `https://registry.npmmirror.com` | 编辑 `launcher/dsh-launch.ps1` 顶部参数 |
| 禁用自动建快捷方式 | 启用 | 环境变量 `DSH_POWER_LAUNCH_SHORTCUT=0` |

## 卸载

```sh
dsh plugin --profile web remove dsh-power-launch
```

重启 `dsh web` 后手动删除桌面 `DeepSeek Harness Web` 快捷方式。

## 开发

```sh
npm install
npm run build      # tsc 类型声明 + tsdown 打包 lib/
npm run typecheck
```

结构：`src/index.ts` 宿主半区（cordis 插件：路由 + 快捷方式 ensure），`src/client/*` 浏览器半区（经官方 `shell.overlay` 槽注册，React 由宿主提供），`launcher/` 与 `assets/` 随包分发。

## 平台说明

启动器与快捷方式逻辑为 Windows 专用（PowerShell 5.1 + WScript）；`.bat` 文件必须保持 **CRLF 行尾 + 纯 ASCII**，`dsh-launch.ps1` 必须保持 **UTF-8 BOM**，否则 cmd/PowerShell 解析会损坏。关机按钮的宿主/客户端半区本身跨平台可用。

## License

MIT © pwping

See the [LICENSE](LICENSE) file for details.
