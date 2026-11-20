const { invoke } = window.__TAURI__.core;

// DOM references
const outputBox = document.getElementById("output-box");
const statusBadge = document.getElementById("telnet-status-badge");
const dispIp = document.getElementById("disp-ip");
const dispUser = document.getElementById("disp-user");
const dispPass = document.getElementById("disp-pass");
const dispPort = document.getElementById("disp-port");

const ipInput = document.getElementById("ip");
const userInput = document.getElementById("user");
const passInput = document.getElementById("pass");
const pwdHint = document.getElementById("pwd-hint");

// Active session state used by all action buttons
let activeConfig = {
  ip: "192.168.1.1",
  user: "CMCCAdmin",
  pass: "aDm8H%MdA",
};

function log(msg, isError = false) {
  const time = new Date().toLocaleTimeString();
  const prefix = isError ? "❌ [ERROR] " : "ℹ️ [INFO] ";
  if (typeof msg === "object") {
    outputBox.textContent = `[${time}] ${prefix}\n` + JSON.stringify(msg, null, 2);
  } else {
    outputBox.textContent = `[${time}] ${prefix}${msg}`;
  }
}

function updateBadge(open) {
  if (open) {
    statusBadge.textContent = "Telnet 状态: 已在线 (23端口畅通)";
    statusBadge.style.background = "#16a34a";
    dispPort.textContent = "已连通 (在线)";
    dispPort.style.color = "#4ade80";
  } else {
    statusBadge.textContent = "Telnet 状态: 未连接";
    statusBadge.style.background = "#dc2626";
    dispPort.textContent = "未连接 (端口关闭)";
    dispPort.style.color = "#f87171";
  }
}

function checkPasswordRule(pwd) {
  if (pwd.length <= 8) {
    return `密码长度必须大于 8 位（当前 ${pwd.length} 位）`;
  }
  if (/\s/.test(pwd)) {
    return "密码不能包含空格";
  }
  const hasLetter = /[a-zA-Z]/.test(pwd);
  const hasDigit = /[0-9]/.test(pwd);
  const hasSpecial = /[^a-zA-Z0-9\s]/.test(pwd);

  if (!hasLetter) return "密码缺少字母（必须包含大小写或英文字母）";
  if (!hasDigit) return "密码缺少数字（0-9）";
  if (!hasSpecial) return "密码缺少特殊字符（如 %、#、*、@、! 等）";

  return null;
}

function updatePasswordHint() {
  const pwd = passInput.value.trim();
  if (!pwd) {
    pwdHint.textContent = "💡 选填项：留空则保持光猫当前密码不变。若输入新密码，必须大于8位且含字母/数字/特殊字符。";
    pwdHint.style.color = "#94a3b8";
    return;
  }
  const err = checkPasswordRule(pwd);
  if (err) {
    pwdHint.textContent = `⚠️ ${err}`;
    pwdHint.style.color = "#f87171";
  } else {
    pwdHint.textContent = "✅ 密码格式符合安全要求（已满足字母、数字、特殊字符且大于8位）";
    pwdHint.style.color = "#4ade80";
  }
}

// Auto detect and enable Telnet
async function runAutoDetect(targetIp) {
  const ip = targetIp || activeConfig.ip || "192.168.1.1";
  log(`[自动模式] 正在启动自检，探测光猫 (${ip})...`);
  statusBadge.textContent = "Telnet 状态: 探测中...";
  statusBadge.style.background = "#d97706";

  try {
    const res = await invoke("auto_detect_telnet", { ip });

    activeConfig.ip = res.ip;
    activeConfig.user = res.telnet_user;
    activeConfig.pass = res.telnet_pass;

    // Update displays
    dispIp.textContent = res.ip;
    dispUser.textContent = res.telnet_user;
    dispPass.textContent = res.telnet_pass;

    // Sync to manual inputs as placeholder / default
    ipInput.value = res.ip;
    if (!userInput.value) userInput.placeholder = `当前: ${res.telnet_user}`;
    if (!passInput.value) passInput.placeholder = `当前: ${res.telnet_pass}`;

    const lines = [
      res.message,
      "",
      "--- 自动探测执行详情 ---",
      ...res.steps,
    ];
    log(lines.join("\n"), !res.success);
    updateBadge(res.port_open);
  } catch (err) {
    log(err, true);
    updateBadge(false);
  }
}

// Call action command using active configuration
async function callCommand(cmdName, extraArgs = {}) {
  try {
    log(`正在执行: ${cmdName}... (目标: ${activeConfig.ip})`);
    const res = await invoke(cmdName, {
      ip: activeConfig.ip,
      user: activeConfig.user,
      pass: activeConfig.pass,
      ...extraArgs,
    });
    log(res);
  } catch (err) {
    log(err, true);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // 1. Setup Tab Switching
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      const target = tab.getAttribute("data-tab");
      document.getElementById(`tab-content-${target}`).classList.add("active");
    });
  });

  // 2. Setup Password input watcher
  passInput.addEventListener("input", updatePasswordHint);
  updatePasswordHint();

  // 3. Clear button
  document.getElementById("btn-clear").onclick = () => {
    outputBox.textContent = "// 日志已清空";
  };

  // 4. Auto mode refresh button
  document.getElementById("btn-auto-refresh").onclick = () => {
    runAutoDetect(activeConfig.ip);
  };

  // 5. Manual mode default reset button
  document.getElementById("btn-reset-default").onclick = () => {
    userInput.value = "CMCCAdmin";
    passInput.value = "aDm8H%MdA";
    updatePasswordHint();
    log("已填入官方默认凭据: CMCCAdmin / aDm8H%MdA");
  };

  // 6. Manual mode apply button
  document.getElementById("btn-manual-apply").onclick = async () => {
    const ip = ipInput.value.trim() || "192.168.1.1";
    const customUser = userInput.value.trim();
    const customPass = passInput.value.trim();

    // If custom password provided, validate it
    if (customPass) {
      const err = checkPasswordRule(customPass);
      if (err) {
        log(`密码不符合规则: ${err}！请修改后重试。`, true);
        passInput.focus();
        return;
      }
    }

    const btn = document.getElementById("btn-manual-apply");
    btn.disabled = true;
    btn.textContent = "⏳ 正在应用配置...";
    log(`[手动模式] 正在向光猫 (${ip}) 应用配置并开启 Telnet...`);

    try {
      const res = await invoke("enable_telnet", {
        ip,
        user: customUser || null,
        pass: customPass || null,
      });

      if (res.telnet_user) {
        activeConfig.user = res.telnet_user;
        dispUser.textContent = res.telnet_user;
      }
      if (res.telnet_pass) {
        activeConfig.pass = res.telnet_pass;
        dispPass.textContent = res.telnet_pass;
      }
      activeConfig.ip = ip;
      dispIp.textContent = ip;

      const lines = [
        res.message,
        "",
        "--- 手动模式执行详情 ---",
        ...res.steps,
      ];
      log(lines.join("\n"), !res.success);
      updateBadge(res.port_open);
    } catch (err) {
      log(err, true);
      updateBadge(false);
    } finally {
      btn.disabled = false;
      btn.textContent = "🚀 应用配置并开启 Telnet";
    }
  };

  // 7. Advanced toolbox actions
  document.getElementById("btn-test-telnet").onclick = () => {
    callCommand("test_telnet");
  };

  document.getElementById("btn-credentials").onclick = () => {
    callCommand("get_credentials");
  };

  document.getElementById("btn-sys-info").onclick = () => {
    callCommand("get_system_info");
  };

  document.getElementById("btn-surveillance").onclick = () => {
    callCommand("check_surveillance");
  };

  document.getElementById("btn-kill-surv").onclick = () => {
    callCommand("kill_surveillance");
  };

  // 8. Custom shell command
  document.getElementById("btn-exec-cmd").onclick = () => {
    const cmd = document.getElementById("custom-cmd").value.trim();
    if (!cmd) {
      log("请输入要执行的指令！", true);
      return;
    }
    callCommand("exec_shell_cmd", { cmd });
  };

  // 9. Auto Launch on App Startup
  setTimeout(() => {
    runAutoDetect("192.168.1.1");
  }, 300);
});
