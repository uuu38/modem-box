const { invoke } = window.__TAURI__.core;

const outputBox = document.getElementById("output-box");
const statusBadge = document.getElementById("telnet-status-badge");
const pwdHint = document.getElementById("pwd-hint");
const passInput = document.getElementById("pass");
const userInput = document.getElementById("user");
const ipInput = document.getElementById("ip");

const getVal = (id) => document.getElementById(id).value.trim();

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
    statusBadge.textContent = "Telnet 状态: 已连通 (23端口在线)";
    statusBadge.style.background = "#16a34a";
  } else {
    statusBadge.textContent = "Telnet 状态: 未连接";
    statusBadge.style.background = "#dc2626";
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
    pwdHint.textContent = "💡 密码要求：必须同时包含字母、数字和特殊字符，不含空格，长度大于 8 位。";
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

async function callCommand(cmdName, args = {}) {
  try {
    log(`正在执行: ${cmdName}...`);
    const res = await invoke(cmdName, {
      ip: getVal("ip"),
      user: getVal("user"),
      pass: getVal("pass"),
      ...args,
    });
    log(res);
  } catch (err) {
    log(err, true);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  passInput.addEventListener("input", updatePasswordHint);
  updatePasswordHint();

  document.getElementById("btn-clear").onclick = () => {
    outputBox.textContent = "// 日志已清空";
  };

  document.getElementById("btn-reset-default").onclick = () => {
    userInput.value = "CMCCAdmin";
    passInput.value = "aDm8H%MdA";
    updatePasswordHint();
    log("已恢复官方默认凭据: CMCCAdmin / aDm8H%MdA");
  };

  document.getElementById("btn-enable-telnet").onclick = async () => {
    const ip = getVal("ip");
    const user = getVal("user");
    const pass = getVal("pass");

    // Client-side validation
    const pwdErr = checkPasswordRule(pass);
    if (pwdErr) {
      log(`密码不符合规则: ${pwdErr}！请修改后重试。`, true);
      passInput.focus();
      return;
    }

    const btn = document.getElementById("btn-enable-telnet");
    btn.disabled = true;
    btn.textContent = "⏳ 正在开启并配置...";
    log(`正在向光猫下发开启指令 (账号: ${user}, 密码: ${pass})...`);

    try {
      const res = await invoke("enable_telnet", {
        ip,
        user: user || null,
        pass: pass || null,
      });

      if (res.telnet_user) {
        userInput.value = res.telnet_user;
      }
      if (res.telnet_pass) {
        passInput.value = res.telnet_pass;
        updatePasswordHint();
      }

      const lines = [
        res.message,
        "",
        "--- 执行详情 ---",
        ...res.steps,
      ];
      log(lines.join("\n"), !res.success);
      updateBadge(res.port_open);
    } catch (err) {
      log(err, true);
      updateBadge(false);
    } finally {
      btn.disabled = false;
      btn.textContent = "🚀 一键开启 / 设置 Telnet";
    }
  };

  document.getElementById("btn-test-telnet").onclick = () => {
    callCommand("test_telnet");
  };

  document.getElementById("btn-sys-info").onclick = () => {
    callCommand("get_system_info");
  };

  document.getElementById("btn-credentials").onclick = () => {
    callCommand("get_credentials");
  };

  document.getElementById("btn-surveillance").onclick = () => {
    callCommand("check_surveillance");
  };

  document.getElementById("btn-kill-surv").onclick = () => {
    callCommand("kill_surveillance");
  };

  document.getElementById("btn-exec-cmd").onclick = () => {
    const cmd = getVal("custom-cmd");
    if (!cmd) {
      log("请输入要执行的指令！", true);
      return;
    }
    callCommand("exec_shell_cmd", { cmd });
  };
});
