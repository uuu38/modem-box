const { invoke } = window.__TAURI__.core;

const outputBox = document.getElementById("output-box");
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

  document.getElementById("btn-enable-telnet").onclick = () => {
    callCommand("enable_telnet");
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
