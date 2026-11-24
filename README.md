# ModemBox

<p align="center">
  <strong>轻量、现代的跨平台光猫诊断与安全加固桌面工具箱</strong><br />
  基于 Tauri 2.0 · Rust 异步引擎 · React 19 · TypeScript · Tailwind CSS v4 构建
</p>

<p align="center">
  <a href="https://github.com/uuu38/modem-box/actions/workflows/ci.yml"><img src="https://github.com/uuu38/modem-box/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-14B8A6.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8DB.svg" alt="Tauri 2.0" />
  <img src="https://img.shields.io/badge/Rust-Edition%202024-orange.svg" alt="Rust" />
  <img src="https://img.shields.io/badge/React-19-61DAFB.svg" alt="React 19" />
</p>

---

## 功能概览

**ModemBox** 面向家庭宽带桥接调试与本地光猫日常运维，提供开箱即用的硬件实时遥测、凭据提取与一键安全加固能力，**所有通信仅发生在本地局域网，凭据按需读取不落盘、不上报任何外部服务器**。

### 核心模块

1. **概览仪表盘（实时遥测）**
   - **真实 CPU 占用率**：基于 `/proc/stat` 静默差分采样（规避海思内核不可中断线程导致的 `loadavg` 虚高），配合每 4 秒自动轮询与最近 20 次采样迷你趋势折线（Sparkline）。
   - **温控与光路监测**：同时读取片上温度传感器（SoC 温度，映射 `25°C ~ 90°C` 刻度）与 GPON 光模块实时温度、收/发光功率（`RX / TX dBm` 健康着色）、PON 注册状态与桥接/路由模式。
   - **硬件规格与 Telnet 通道**：一屏展示设备型号、SoC 芯片、内核与固件版本、连续运行时长及 Telnet 凭据状态。

2. **核心凭据库**
   - 一键解析光猫底层配置，安全读取 **PPPoE 宽带拨号账号/密码**、**Web 超级管理员与普通密码**、**GPON 注册密码**、**设备 SN 码**、**基准 MAC** 与 **TR-069 ACS 地址**。
   - 支持单条复制、全局明文显隐切换与一键导出摘要备份。

3. **安全审计与加固**
   - **Java OSGi 容器控制（`cmccdpi` / `andlink`）**：实时检测进程 PID，支持一键停止释放约 60~100MB 内存，或按需恢复启动（兼容非 Root Telnet 会话，内置二次确认防误触）。
   - **桥接防卡死加固（LAN IPv6 RA / DHCPv6 开关）**：一键关闭光猫 LAN 侧 IPv6 路由通告与 DHCPv6，防止桥接多线接入主路由时广播假网关 `fe80::1` 导致断流卡顿（原生配置持久化，重启不丢失）。
   - **内置 FTP 服务开关（`vsftpd` :21）**：一键关闭出厂默认开放的冗余 FTP 端口。
   - **真实状态核验（零误报）**：联动检测 TR-069 WAN 通道隔离状态、`/mirrorCfg` 交换芯片镜像规则状态及 `netstat` 公网外联 TCP 连接。

4. **快捷终端**
   - 内置哨兵分帧 Telnet 执行引擎，解决 BusyBox 80 列长命令回显折行污染问题。
   - 支持 `↑ / ↓` 历史命令翻阅、`⌘K` 清屏、自适应窗口高度与常用排障命令快捷片。

5. **连接设置与自动探测**
   - 启动时自动探测局域网光猫并同步当前 Telnet 凭据（23 端口未开时支持自动启用）。
   - 支持手动指定网关 IP 与自定义 Telnet 账号/密码，内置实时密码合规校验（长度 > 8、含字母/数字/特殊字符、不含空格）。

---

## 适配设备与固件

| 品牌 / 型号 | 硬件平台 / 系统 | 验证状态 |
| :--- | :--- | :---: |
| 四川天邑 `TEWA-7100A`（移动定制） | Hisilicon `Hi5662Y` · `HSAN Linux 5.10` | ✅ 实机全功能通过 |
| 同平台天邑 / 烽火定制智能网关 | 支持 `/getObjs` · `/setObjs` 及 BusyBox Telnet | 🧪 理论兼容（欢迎提交适配反馈） |

> 欢迎通过 [设备适配模板](https://github.com/uuu38/modem-box/issues/new?template=device_support.yml) 提交更多型号的兼容报告。

---

## 快捷键

| 快捷键（macOS / Windows） | 功能 |
| :--- | :--- |
| `⌘1` ~ `⌘5` / `Ctrl+1` ~ `Ctrl+5` | 切换左侧五个功能页面 |
| `⌘R` / `Ctrl+R` | 在概览仪表盘立即手动采样刷新 |
| `⌘L` / `Ctrl+L` | 展开 / 收起底部运行日志抽屉 |
| `⌘K` / `Ctrl+K` | 在快捷终端一键清屏 |

---

## 技术架构

```text
modem-box/
├── src/                        # React 19 + TypeScript + Tailwind CSS v4 前端
│   ├── components/             # AppShell, RadialGauge (含 Sparkline), CredentialRow, Primitives
│   ├── pages/                  # Dashboard, Credentials, Surveillance, Terminal, Settings
│   ├── types/                  # 前后端强类型数据结构定义
│   └── utils/                  # 密码规则校验等工具函数
├── src-tauri/                  # Tauri 2.0 + Rust (Edition 2024) 原生后端
│   └── src/
│       ├── web_client.rs       # 异步 HTTP 客户端 (/getObjs, /setObjs, /mirrorCfg, 光功率解析)
│       ├── telnet_client.rs    # 异步 Telnet 引擎 (哨兵输出截取, 快速认证错误检测)
│       ├── modem_manager.rs    # 硬件遥测 (/proc/stat 差分 CPU), 凭据解析与安全审计引擎
│       └── commands.rs         # Tauri IPC 命令导出
└── .github/                    # CI 质量门禁、Release 自动化与社区模板
```

---

## 本地开发与构建

### 环境要求

- [Bun](https://bun.sh/) >= 1.2（或 Node.js >= 20）
- [Rust](https://rustup.rs/) >= 1.85（Edition 2024）
- [Tauri 2.0 系统依赖](https://v2.tauri.app/start/prerequisites/)

### 常用命令

```bash
# 1. 安装前端依赖
bun install

# 2. 启动桌面开发模式（前端热更新 + Rust 后端）
bun run tauri dev

# 3. 本地完整质量检查（TS 类型检查 + 前端构建 + Rust 格式化 + Clippy + 单元测试）
bun run check

# 4. 打包发布桌面安装包（macOS .dmg/.app / Windows .msi/.exe）
bun run tauri build
```

如需针对实机光猫跑端到端只读联调测试（不会修改任何配置）：

```bash
cd src-tauri
MODEM_TEST_IP=192.168.1.1 cargo test -- --ignored --nocapture live_smoke_test_modem
```

---

## 安全与免责声明

- 本工具**仅限用于个人合法拥有的本地家庭网络设备诊断、桥接配置核查与日常维护**，严禁用于任何未经授权的网络访问或违规用途。
- 软件仅在用户主动触发时与局域网目标设备通信，不收集、不上传、不在磁盘明文持久化任何账号与密码。
- 详情请参阅 [SECURITY.md](./SECURITY.md)。

---

## 参与贡献与开源协议

- 贡献流程与代码规范请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。
- 版本变更记录请参阅 [CHANGELOG.md](./CHANGELOG.md)。
- 本项目基于 [MIT License](./LICENSE) 开源。
