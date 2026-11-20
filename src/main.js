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
    statusBadge.textContent = "Telnet 状态: 已连通 (23端口在线)";
    statusBadge.style.background = "#16a34a";
  } else {
    statusBadge.textContent = "Telnet 状态: 未连接";
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
    const user = getVal("user");
    const pass = getVal("pass");

    const btn = document.getElementById("btn-enable-telnet");
    btn.disabled = true;
    btn.textContent = "⏳ 正在开启 Telnet...";
    log("正在通过免鉴权通道发送开启指令并检测端口...");

    try {
      const res = await invoke("enable_telnet", {
        ip,
        user: user || null,
        pass: pass || null,
      });

      if (res.telnet_user) {
        document.getElementById("user").value = res.telnet_user;
      }
      if (res.telnet_pass) {
        document.getElementById("pass").value = res.telnet_pass;
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
