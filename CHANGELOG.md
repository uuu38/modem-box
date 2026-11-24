# Changelog

本项目版本日志遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/) 规范。

## [0.6.0] - 2026-11-24

### Added
- **实时趋势折线（Sparkline）**：仪表盘三枚环形表盘支持滚动记录最近 20 次采样并绘制渐变趋势折线。
- **桌面级快捷键**：支持 `⌘1~5` 切页、`⌘R` 刷新仪表盘、`⌘L` 开关日志抽屉及终端 `⌘K` 清屏。
- **凭据页增强**：新增全局「显示全部 / 隐藏明文」开关、设备 SN 码展示与首次提取引导横幅。
- **离线引导与日志导出**：新增未连接状态操作横幅及底部日志抽屉一键复制功能。
- **开源工程规范**：补齐 MIT `LICENSE`、完整 `README.md`、`SECURITY.md`、`CONTRIBUTING.md`、`.editorconfig`、`rustfmt.toml` 与 GitHub CI / Release 工作流。

### Changed
- **桌面响应式布局精修**：默认 `1080×740` 窗口下仪表盘 6 格硬件参数升级为 3×2 网格、Telnet 凭据改用上下堆叠卡片、凭据库双列断点调整为 `xl:`，彻底消除文字截断。
- **数据可视化与交互优化**：芯片温度刻度调整为 `25°C ~ 90°C` 真实区间；精简顶部状态栏并移除冗余模式切换；Toast 通知移至右下角避免遮挡按钮；终端输出区改为 `flex-1` 自适应窗口高度；安全审计列表固定右对齐并给「启动 Java 容器」增加二次确认防误触。
- **对比度与可读性**：次级文本提亮至 `#7E91AA`（满足 WCAG AA），硬件参数支持 `select-text` 框选复制。
- **Rust 代码质量**：清理全部 Clippy 警告并通过 `cargo clippy --all-targets -- -D warnings` 与 `cargo fmt --check`。

## [0.5.0] - 2026-11-24

### Added
- **真实 CPU 占用率采集**：改用 `/proc/stat` 450ms 静默差分采样，解决海思内核不可中断线程导致的 `loadavg` 虚高问题。
- **自动实时轮询**：仪表盘新增 4 秒自动采样与手动暂停开关，并加入并发防重叠锁。
- **光路与设备直读**：并发查询 `DeviceInfo` 与 `X_CMCC_GponInterfaceConfig`，展示光功率 `RX / TX dBm`、光模块温度、设备型号与芯片信息。
- **安全审计与加固重做**：新增 LAN 侧 IPv6 RA / DHCPv6 开关、内置 FTP 服务（21 端口）开关及 `netstat` 公网外联检测。

### Fixed
- **Telnet 哨兵分帧**：使用 `printf` 哨兵标记截取标准输出，彻底修复 BusyBox 长命令回显折行污染，同时支持密码错误快速失败。
- **消除安全审计误报**：`/mirrorCfg?action=get` 真实核验镜像规则状态，TR-069 联动 WAN 通道状态，诚实区分非 Root 会话权限边界。
- **快捷终端体验**：新增 `↑ / ↓` 历史命令翻阅与连续追加输出。

## [0.4.0] - 2026-11-22

### Added
- 迁移前端至 React 19 + TypeScript + Vite + Tailwind CSS v4 深色青色设计系统。
- 统一仪表盘硬件健康卡片（RAM / 温度 / CPU 环形表盘 + 规格条）。
- 新增 Java OSGi 容器停止与非 Root 兼容恢复启动能力。

## [0.1.0] - 2026-11-18

### Added
- 初始化 Tauri 2.0 + Rust 异步架构，支持免密探测开启 Telnet、凭据提取与快捷终端原型。
