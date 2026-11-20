const { invoke } = window.__TAURI__.core;

// Active connection state
const activeConfig = {
  ip: "192.168.1.1",
  user: "CMCCAdmin",
  pass: "aDm8H%MdA",
  mode: "auto",
};

const logs = [];

// ===== UI Helpers =====
function showToast(msg, type = "success") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 2600);
}

function appendLog(msg, isError = false) {
  const time = new Date().toLocaleTimeString();
  const prefix = isError ? "❌" : "ℹ️";
  const text = typeof msg === "object" ? JSON.stringify(msg, null, 2) : String(msg);
  const entry = `[${time}] ${prefix} ${text}`;
  logs.push(entry);
  if (logs.length > 100) logs.shift();

  const consoleBody = document.getElementById("console-body");
  const consoleLatest = document.getElementById("console-latest");
  consoleBody.textContent = logs.join("\n\n");
  consoleBody.scrollTop = consoleBody.scrollHeight;
  consoleLatest.textContent = `${prefix} ${text.split("\n")[0]}`;
}

function setConnectionStatus(state, text) {
  const pill = document.getElementById("top-status-pill");
  const label = document.getElementById("top-status-text");
  const dashBadge = document.getElementById("dash-port-badge");

  pill.classList.remove("online", "offline", "checking");
  pill.classList.add(state);
  label.textContent = text;

  if (state === "online") {
    dashBadge.className = "badge-state badge-safe";
    dashBadge.textContent = "端口 23 在线";
  } else if (state === "offline") {
    dashBadge.className = "badge-state badge-danger";
    dashBadge.textContent = "端口 23 未连接";
  } else {
    dashBadge.className = "badge-state badge-neutral";
    dashBadge.textContent = "检测中...";
  }
}

function setSecretValue(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  const displayVal = val || "未配置";
  el.dataset.secret = val || "";
  if (!val) {
    el.textContent = "未配置";
    return;
  }
  const hidden = el.dataset.hidden !== "false";
  el.textContent = hidden ? "•".repeat(Math.min(val.length, 14)) : displayVal;
}

function syncCredentialsDisplay() {
  document.getElementById("dash-ip").textContent = activeConfig.ip;
  document.getElementById("dash-telnet-user").textContent = activeConfig.user;
  setSecretValue("dash-telnet-pass", activeConfig.pass);

  document.getElementById("set-auto-ip").textContent = activeConfig.ip;
  document.getElementById("set-auto-user").textContent = activeConfig.user;
  document.getElementById("set-auto-pass").textContent = activeConfig.pass;
}

function switchView(viewName) {
  document.querySelectorAll(".nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === viewName);
  });
  document.querySelectorAll(".view-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `view-${viewName}`);
  });
}

function setMode(mode) {
  activeConfig.mode = mode;
  document.getElementById("top-mode-auto").classList.toggle("active", mode === "auto");
  document.getElementById("top-mode-manual").classList.toggle("active", mode === "manual");
  if (mode === "manual") {
    switchView("settings");
  }
}

// ===== Password Validation =====
function checkPasswordRule(pwd) {
  if (pwd.length <= 8) {
    return `密码长度必须大于 8 位（当前 ${pwd.length} 位）`;
  }
  if (/\s/.test(pwd)) {
    return "密码不能包含空格";
  }
  if (!/[a-zA-Z]/.test(pwd)) return "密码缺少英文字母";
  if (!/[0-9]/.test(pwd)) return "密码缺少数字 (0-9)";
  if (!/[^a-zA-Z0-9\s]/.test(pwd)) return "密码缺少特殊字符（如 %、#、*、@ 等）";
  return null;
}

function updatePasswordHint() {
  const pwd = document.getElementById("manual-pass").value.trim();
  const hint = document.getElementById("pwd-hint");
  if (!pwd) {
    hint.textContent = "💡 选填项：留空则保持光猫当前密码不变。若输入新密码，必须大于 8 位，且同时包含字母、数字和特殊字符，不含空格。";
    hint.style.color = "#94a3b8";
    return;
  }
  const err = checkPasswordRule(pwd);
  if (err) {
    hint.textContent = `⚠️ ${err}`;
    hint.style.color = "#f87171";
  } else {
    hint.textContent = "✅ 密码格式符合安全要求";
    hint.style.color = "#34d399";
  }
}

// ===== Core Backend Actions =====
async function runAutoDetect(targetIp) {
  const ip = targetIp || activeConfig.ip || "192.168.1.1";
  setConnectionStatus("checking", `正在探测 ${ip}...`);
  appendLog(`[自动模式] 启动自检，探测光猫 (${ip})...`);

  try {
    const res = await invoke("auto_detect_telnet", { ip });
    activeConfig.ip = res.ip;
    activeConfig.user = res.telnet_user;
    activeConfig.pass = res.telnet_pass;

    document.getElementById("manual-ip").value = res.ip;
    syncCredentialsDisplay();
    appendLog(`${res.message}\n${res.steps.join("\n")}`, !res.success);

    if (res.port_open) {
      setConnectionStatus("online", `${res.ip} · Telnet 已连通`);
      showToast("Telnet 已自动连通就绪");
      // Automatically pull dashboard hardware info after connection succeeds
      fetchSystemInfo(true);
    } else {
      setConnectionStatus("offline", `${res.ip} · 23端口未响应`);
      showToast("23 端口暂未响应", "error");
    }
  } catch (err) {
    setConnectionStatus("offline", `${ip} · 连接失败`);
    appendLog(err, true);
    showToast("连接光猫失败，请查看日志", "error");
  }
}

async function fetchSystemInfo(silent = false) {
  try {
    if (!silent) appendLog("正在读取系统硬件与内存状态...");
    const info = await invoke("get_system_info", {
      ip: activeConfig.ip,
      user: activeConfig.user,
      pass: activeConfig.pass,
    });

    document.getElementById("dash-pon").textContent = info.pon_status || "未知";
    document.getElementById("dash-wan-mode").textContent = info.wan_mode || "未知";
    document.getElementById("dash-uptime").textContent = info.uptime || "--";
    document.getElementById("dash-temp").textContent = `温度: ${info.temperature}`;
    document.getElementById("dash-cpu").textContent = info.cpu_model;
    document.getElementById("dash-cores").textContent = `${info.cpu_cores} 核`;
    document.getElementById("dash-kernel").textContent = info.kernel_version;

    document.getElementById("dash-ram-text").textContent = `内存使用: ${info.ram_used_mb} MB / ${info.ram_total_mb} MB`;
    document.getElementById("dash-ram-pct").textContent = `${info.ram_usage_percent}%`;

    const bar = document.getElementById("dash-ram-bar");
    bar.style.width = `${Math.min(info.ram_usage_percent, 100)}%`;
    bar.classList.toggle("high", info.ram_usage_percent >= 75);

    if (!silent) {
      appendLog(`硬件状态已更新：CPU ${info.cpu_model} | 内存 ${info.ram_usage_percent}% | 温度 ${info.temperature}`);
      showToast("设备状态已刷新");
    }
  } catch (err) {
    appendLog(`读取硬件状态失败: ${err}`, true);
    if (!silent) showToast("读取硬件状态失败", "error");
  }
}

async function fetchCredentials() {
  const btn = document.getElementById("btn-fetch-creds");
  btn.disabled = true;
  btn.textContent = "⏳ 正在提取...";
  appendLog("正在从光猫配置文件提取核心凭据...");

  try {
    const c = await invoke("get_credentials", {
      ip: activeConfig.ip,
      user: activeConfig.user,
      pass: activeConfig.pass,
    });

    document.getElementById("cred-pppoe-user").textContent = c.pppoe_username || "未配置";
    setSecretValue("cred-pppoe-pass", c.pppoe_password);
    document.getElementById("cred-admin-user").textContent = c.admin_username || "CMCCAdmin";
    setSecretValue("cred-admin-pass", c.admin_password);
    setSecretValue("cred-user-pass", c.user_password);
    setSecretValue("cred-gpon-pass", c.gpon_password);
    document.getElementById("cred-mac").textContent = c.base_mac || "未读取";
    document.getElementById("cred-acs").textContent = c.acs_url || "无";
    document.getElementById("cred-acs").title = c.acs_url || "";

    appendLog("核心凭据提取成功！");
    showToast("核心凭据提取完成");
  } catch (err) {
    appendLog(`提取凭据失败: ${err}`, true);
    showToast("提取凭据失败", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "🔑 提取全部核心凭据";
  }
}

async function scanSurveillance() {
  appendLog("正在扫描光猫监控进程...");
  try {
    const s = await invoke("check_surveillance", {
      ip: activeConfig.ip,
      user: activeConfig.user,
      pass: activeConfig.pass,
    });

    const javaBadge = document.getElementById("surv-java-badge");
    javaBadge.className = `badge-state ${s.java_running ? "badge-danger" : "badge-safe"}`;
    javaBadge.textContent = s.java_running ? `🔴 运行中 (PID ${s.java_pid || "?"})` : "🟢 已停止";

    const trBadge = document.getElementById("surv-tr069-badge");
    trBadge.className = `badge-state ${s.tr069_running ? "badge-danger" : "badge-safe"}`;
    trBadge.textContent = s.tr069_running ? `🔴 运行中 (PID ${s.tr069_pid || "?"})` : "🟢 已停止";

    const mirBadge = document.getElementById("surv-mirror-badge");
    mirBadge.className = `badge-state ${s.mirror_driver_loaded ? "badge-danger" : "badge-safe"}`;
    mirBadge.textContent = s.mirror_driver_loaded ? "🔴 已加载" : "🟢 未加载";

    document.getElementById("surv-summary-text").textContent = s.message;
    appendLog(`监控扫描完成：${s.message}`);
    showToast("监控状态扫描完成");
  } catch (err) {
    appendLog(`扫描监控失败: ${err}`, true);
    showToast("扫描监控失败", "error");
  }
}

async function killAllSurveillance() {
  appendLog("正在停止 Java/DPI/TR069 监控进程...");
  try {
    const msg = await invoke("kill_surveillance", {
      ip: activeConfig.ip,
      user: activeConfig.user,
      pass: activeConfig.pass,
    });
    appendLog(msg);
    showToast("已停止监控进程并释放内存");
    await scanSurveillance();
    await fetchSystemInfo(true);
  } catch (err) {
    appendLog(`停止监控失败: ${err}`, true);
    showToast("停止监控失败", "error");
  }
}

async function execTerminalCmd(cmd) {
  const screen = document.getElementById("term-output");
  screen.textContent = `$ ${cmd}\n⏳ 执行中...`;
  try {
    const out = await invoke("exec_shell_cmd", {
      ip: activeConfig.ip,
      user: activeConfig.user,
      pass: activeConfig.pass,
      cmd,
    });
    screen.textContent = `$ ${cmd}\n${out || "(无输出)"}`;
    appendLog(`终端执行: ${cmd}`);
  } catch (err) {
    screen.textContent = `$ ${cmd}\n❌ ERROR: ${err}`;
    appendLog(`终端执行失败: ${err}`, true);
  }
}

// ===== Event Bindings =====
window.addEventListener("DOMContentLoaded", () => {
  // Navigation
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Top mode switch
  document.getElementById("top-mode-auto").onclick = () => setMode("auto");
  document.getElementById("top-mode-manual").onclick = () => setMode("manual");
  document.getElementById("btn-top-refresh").onclick = () => runAutoDetect(activeConfig.ip);

  // Copy & Eye buttons (delegated)
  document.body.addEventListener("click", async (e) => {
    const copyBtn = e.target.closest(".copy-btn");
    if (copyBtn) {
      const target = document.getElementById(copyBtn.dataset.copyTarget);
      if (!target) return;
      const val = target.classList.contains("secret-val") ? target.dataset.secret : target.textContent;
      if (!val || val === "未提取" || val === "未配置") {
        showToast("当前暂无内容可复制", "error");
        return;
      }
      await navigator.clipboard.writeText(val);
      showToast("已复制到剪贴板");
      return;
    }

    const eyeBtn = e.target.closest(".eye-btn");
    if (eyeBtn) {
      const target = document.getElementById(eyeBtn.dataset.eyeTarget);
      if (!target || !target.dataset.secret) return;
      const isHidden = target.dataset.hidden !== "false";
      target.dataset.hidden = isHidden ? "false" : "true";
      target.textContent = isHidden
        ? target.dataset.secret
        : "•".repeat(Math.min(target.dataset.secret.length, 14));
      eyeBtn.textContent = isHidden ? "🙈 隐藏" : "👁 显示";
    }
  });

  // Dashboard buttons
  document.getElementById("btn-refresh-dashboard").onclick = () => fetchSystemInfo(false);
  document.getElementById("btn-dash-test-telnet").onclick = async () => {
    try {
      const msg = await invoke("test_telnet", {
        ip: activeConfig.ip,
        user: activeConfig.user,
        pass: activeConfig.pass,
      });
      appendLog(msg);
      showToast("Telnet 握手测试成功");
    } catch (err) {
      appendLog(err, true);
      showToast("Telnet 握手失败", "error");
    }
  };
  document.getElementById("btn-dash-kill-surv").onclick = killAllSurveillance;

  // Credentials
  document.getElementById("btn-fetch-creds").onclick = fetchCredentials;

  // Surveillance
  document.getElementById("btn-scan-surv").onclick = scanSurveillance;
  document.getElementById("btn-kill-all-surv").onclick = killAllSurveillance;

  // Terminal
  document.querySelectorAll(".chip-btn").forEach((chip) => {
    chip.addEventListener("click", () => {
      const cmd = chip.dataset.cmd;
      document.getElementById("term-input").value = cmd;
      execTerminalCmd(cmd);
    });
  });
  document.getElementById("btn-term-exec").onclick = () => {
    const cmd = document.getElementById("term-input").value.trim();
    if (cmd) execTerminalCmd(cmd);
  };
  document.getElementById("term-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const cmd = e.target.value.trim();
      if (cmd) execTerminalCmd(cmd);
    }
  });
  document.getElementById("btn-term-clear").onclick = () => {
    document.getElementById("term-output").textContent = "// 屏幕已清空";
  };

  // Settings (Auto & Manual)
  document.getElementById("btn-settings-auto").onclick = () => {
    setMode("auto");
    runAutoDetect(activeConfig.ip);
  };

  document.getElementById("manual-pass").addEventListener("input", updatePasswordHint);
  document.getElementById("btn-reset-default").onclick = () => {
    document.getElementById("manual-user").value = "CMCCAdmin";
    document.getElementById("manual-pass").value = "aDm8H%MdA";
    updatePasswordHint();
    showToast("已填入官方默认凭据");
  };

  document.getElementById("btn-manual-apply").onclick = async () => {
    const ip = document.getElementById("manual-ip").value.trim() || "192.168.1.1";
    const customUser = document.getElementById("manual-user").value.trim();
    const customPass = document.getElementById("manual-pass").value.trim();

    if (customPass) {
      const err = checkPasswordRule(customPass);
      if (err) {
        showToast(err, "error");
        appendLog(`密码格式校验未通过: ${err}`, true);
        document.getElementById("manual-pass").focus();
        return;
      }
    }

    const btn = document.getElementById("btn-manual-apply");
    btn.disabled = true;
    btn.textContent = "⏳ 正在应用...";

    try {
      const res = await invoke("enable_telnet", {
        ip,
        user: customUser || null,
        pass: customPass || null,
      });

      activeConfig.ip = ip;
      if (res.telnet_user) activeConfig.user = res.telnet_user;
      if (res.telnet_pass) activeConfig.pass = res.telnet_pass;
      syncCredentialsDisplay();

      appendLog(`${res.message}\n${res.steps.join("\n")}`, !res.success);
      if (res.port_open) {
        setConnectionStatus("online", `${ip} · Telnet 已连通`);
        showToast("配置已应用且 Telnet 已连通");
      } else {
        setConnectionStatus("offline", `${ip} · 23端口未响应`);
        showToast("已下发配置，但 23 端口暂未响应", "error");
      }
    } catch (err) {
      appendLog(err, true);
      showToast("应用配置失败", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🚀 应用配置并开启 Telnet";
    }
  };

  // Bottom Console Drawer
  const drawer = document.getElementById("console-drawer");
  const toggleText = document.getElementById("console-toggle-text");
  document.getElementById("console-bar").addEventListener("click", (e) => {
    if (e.target.id === "btn-log-clear") return;
    drawer.classList.toggle("open");
    toggleText.textContent = drawer.classList.contains("open") ? "收起 ▼" : "展开 ▲";
  });

  document.getElementById("btn-log-clear").onclick = (e) => {
    e.stopPropagation();
    logs.length = 0;
    document.getElementById("console-body").textContent = "";
    document.getElementById("console-latest").textContent = "// 日志已清空";
  };

  // Startup auto-detect
  syncCredentialsDisplay();
  setTimeout(() => runAutoDetect("192.168.1.1"), 250);
});
