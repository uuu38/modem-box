import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppShell, type NavTab } from "./components/AppShell";
import { ToastContainer } from "./components/ToastContainer";
import { CredentialsPage } from "./pages/CredentialsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SurveillancePage } from "./pages/SurveillancePage";
import { TerminalPage } from "./pages/TerminalPage";
import type {
  AutoDetectResult,
  ConnectionConfig,
  Credentials,
  LogEntry,
  LogLevel,
  SurveillanceStatus,
  SystemInfo,
  ToastItem,
} from "./types/modem";

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [config, setConfig] = useState<ConnectionConfig>({
    ip: "192.168.1.1",
    user: "CMCCAdmin",
    pass: "aDm8H%MdA",
    state: "checking",
    mode: "auto",
  });

  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [loadingSysInfo, setLoadingSysInfo] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [surveillance, setSurveillance] = useState<SurveillanceStatus | null>(
    null
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (type: ToastItem["type"], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2500);
    },
    []
  );

  const addLog = useCallback((level: LogLevel, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-99), { id, time, level, message }]);
  }, []);

  const fetchSystemInfoWith = useCallback(
    async (ip: string, user: string, pass: string, silent = false) => {
      setLoadingSysInfo(true);
      if (!silent) addLog("info", "正在读取设备硬件与内存状态...");
      try {
        const info = await invoke<SystemInfo>("get_system_info", {
          ip,
          user,
          pass,
        });
        setSysInfo(info);
        if (!silent) {
          addLog(
            "success",
            `状态已刷新：CPU ${info.cpu_model} | 内存 ${info.ram_usage_percent}% | 温度 ${info.temperature}`
          );
          addToast("success", "设备状态已刷新");
        }
      } catch (err) {
        const e = typeof err === "string" ? err : String(err);
        addLog("error", `读取设备状态失败: ${e}`);
        if (!silent) addToast("error", "读取设备状态失败");
      } finally {
        setLoadingSysInfo(false);
      }
    },
    [addLog, addToast]
  );

  const runAutoDetect = useCallback(
    async (targetIp?: string) => {
      const ip = targetIp || "192.168.1.1";
      setConfig((prev) => ({ ...prev, ip, state: "checking", mode: "auto" }));
      addLog("info", `[自动模式] 正在探测光猫 (${ip})...`);

      try {
        const res = await invoke<AutoDetectResult>("auto_detect_telnet", {
          ip,
        });
        setConfig({
          ip: res.ip,
          user: res.telnet_user,
          pass: res.telnet_pass,
          state: res.port_open ? "online" : "offline",
          mode: "auto",
        });
        addLog(
          res.success ? "success" : "warn",
          `${res.message}\n${res.steps.join("\n")}`
        );

        if (res.port_open) {
          addToast("success", "Telnet 已自动连通就绪");
          void fetchSystemInfoWith(
            res.ip,
            res.telnet_user,
            res.telnet_pass,
            true
          );
        } else {
          addToast("error", "23 端口暂未响应");
        }
      } catch (err) {
        const e = typeof err === "string" ? err : String(err);
        setConfig((prev) => ({ ...prev, state: "offline" }));
        addLog("error", e);
        addToast("error", "连接光猫失败，请查看运行日志");
      }
    },
    [addLog, addToast, fetchSystemInfoWith]
  );

  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void runAutoDetect("192.168.1.1");
  }, [runAutoDetect]);

  const runSurveillanceAction = useCallback(
    async (action: "kill" | "restore") => {
      const meta =
        action === "kill"
          ? {
              cmd: "kill_surveillance",
              startLog: "正在停止 Java DPI / 监控进程并锁定自启...",
              okToast: "已停止监控并释放内存",
              errLabel: "停止监控失败",
            }
          : {
              cmd: "restore_surveillance",
              startLog: "正在恢复 Java 监控脚本权限并重启容器...",
              okToast: "已恢复 Java 监控服务",
              errLabel: "恢复监控失败",
            };

      addLog("info", meta.startLog);
      try {
        const msg = await invoke<string>(meta.cmd, {
          ip: config.ip,
          user: config.user,
          pass: config.pass,
        });
        addLog("success", msg);
        addToast("success", meta.okToast);

        const updatedStatus = await invoke<SurveillanceStatus>(
          "check_surveillance",
          {
            ip: config.ip,
            user: config.user,
            pass: config.pass,
          }
        );
        setSurveillance(updatedStatus);
        await fetchSystemInfoWith(config.ip, config.user, config.pass, true);
      } catch (err) {
        const e = typeof err === "string" ? err : String(err);
        addLog("error", `${meta.errLabel}: ${e}`);
        addToast(
          "error",
          `${meta.errLabel}: ${e.length > 60 ? `${e.slice(0, 60)}...` : e}`
        );
      }
    },
    [addLog, addToast, config.ip, config.pass, config.user, fetchSystemInfoWith]
  );

  const handleModeChange = (mode: "auto" | "manual") => {
    setConfig((prev) => ({ ...prev, mode }));
    if (mode === "manual") {
      setActiveTab("settings");
    }
  };

  return (
    <>
      <AppShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        config={config}
        onModeChange={handleModeChange}
        onReconnect={() => void runAutoDetect(config.ip)}
        logs={logs}
        onClearLogs={() => setLogs([])}
      >
        {activeTab === "dashboard" && (
          <DashboardPage
            config={config}
            sysInfo={sysInfo}
            loadingSysInfo={loadingSysInfo}
            onRefreshSysInfo={() =>
              void fetchSystemInfoWith(config.ip, config.user, config.pass)
            }
            onKillSurveillance={() => runSurveillanceAction("kill")}
            onRestoreSurveillance={() => runSurveillanceAction("restore")}
            onLog={addLog}
            onToast={addToast}
            onJumpSettings={() => setActiveTab("settings")}
          />
        )}

        {activeTab === "credentials" && (
          <CredentialsPage
            config={config}
            credentials={credentials}
            onCredentialsLoaded={setCredentials}
            onLog={addLog}
            onToast={addToast}
          />
        )}

        {activeTab === "surveillance" && (
          <SurveillancePage
            config={config}
            status={surveillance}
            onStatusChange={setSurveillance}
            onKillSurveillance={() => runSurveillanceAction("kill")}
            onRestoreSurveillance={() => runSurveillanceAction("restore")}
            onLog={addLog}
            onToast={addToast}
          />
        )}

        {activeTab === "terminal" && (
          <TerminalPage config={config} onLog={addLog} onToast={addToast} />
        )}

        {activeTab === "settings" && (
          <SettingsPage
            config={config}
            onAutoDetect={runAutoDetect}
            onConfigUpdated={(partial) =>
              setConfig((prev) => ({ ...prev, ...partial }))
            }
            onLog={addLog}
            onToast={addToast}
          />
        )}
      </AppShell>

      <ToastContainer toasts={toasts} />
    </>
  );
}
export default App;
