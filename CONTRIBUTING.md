# 参与贡献 (Contributing)

感谢你对 **ModemBox** 的兴趣！无论是 Bug 修复、UI 优化、文档改进还是新光猫型号的适配，都非常欢迎提交 Issue 或 Pull Request。

---

## 本地开发环境

1. **安装依赖工具**：
   - [Bun](https://bun.sh/) `>= 1.2`
   - [Rust](https://rustup.rs/) `>= 1.85`（需包含 `rustfmt` 与 `clippy` 组件）
   - Tauri 2.0 平台依赖（参考 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/)）

2. **克隆并启动开发模式**：
   ```bash
   git clone https://github.com/uuu38/modem-box.git
   cd modem-box
   bun install
   bun run tauri dev
   ```

---

## 提交前质量检查

提交 PR 前，请确保以下命令在本地全部零警告、零错误通过：

```bash
# 一键运行全量检查（TS 类型检查 + 前端构建 + Rust 格式化 + Clippy + 单元测试）
bun run check
```

或按前后端分别运行：

```bash
# 前端
bun run build

# Rust 后端
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

---

## 提交信息规范

本项目遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 规范：

- `feat(scope): ...` — 新增功能或机型适配
- `fix(scope): ...` — 修复 Bug
- `refactor(scope): ...` — 代码重构（不改变外部行为）
- `docs: ...` — 文档变更
- `chore: ...` — 构建配置、依赖或 CI 维护

示例：
```text
feat(modem): add optical power parsing for FiberHome HG6145F
fix(telnet): handle custom prompt suffix on BusyBox 1.35
```

---

## 隐私与安全准则

- **严禁提交真实凭据**：请勿在代码、测试用例、截图或 Issue 日志中包含你的真实宽带账号、密码、LOID/GPON 密码、SN 码或公网 IP（提交前请打码）。
- **严禁提交提权漏洞利用**：本项目仅使用光猫标准本地管理接口（HTTP 管理端点与合法授权的 Telnet 会话），不接受任何绕过认证、破解系统密码哈希或利用二进制漏洞提权的代码。
