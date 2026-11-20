const { invoke } = window.__TAURI__.core;

const outputBox = document.getElementById("output-box");
const statusBadge = document.getElementById("telnet-status-badge");
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
    statusBadge.textContent = "Telnet 状态: 已开启 (23端口通)";
    statusBadge.style.background = "#16a34a";
  } else {
    statusBadge.textContent = "Telnet 状态: 未开启";
    statusBadge.style.background = "#dc2626";
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
  document.getElementById("btn-clear").onclick = () => {
    outputBox.textContent = "// 日志已清空";
  };

  document.getElementById("btn-enable-telnet").onclick = async () => {
    const ip = getVal("ip");
    const webUser = getVal("web-user");
    const webPass = getVal("web-pass");

    if (!webPass) {
      log("请先输入光猫背面的普通用户密码！", true);
      document.getElementById("web-pass").focus();
      return;
    }

    const btn = document.getElementById("btn-enable-telnet");
    btn.disabled = true;
    btn.textContent = "⏳ 正在鉴权并开启...";
    log("正在向光猫发起 Web 鉴权登录并开启 Telnet...");

    try {
      const res = await invoke("enable_telnet", {
        ip,
        webUser,
        webPass,
      });

      const lines = [
        res.message,
        "",
        "--- 执行步骤详情 ---",
        ...res.steps,
      ];
      log(lines.join("\n"), !res.success);
      updateBadge(res.port_open);
    } catch (err) {
      log(err, true);
      updateBadge(false);
    } finally {
      btn.disabled = false;
      btn.textContent = "🚀 一键开启 Telnet";
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
