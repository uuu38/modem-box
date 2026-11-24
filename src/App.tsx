import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppShell, type NavTab } from "./components/AppShell";
import { ToastContainer } from "./components/ToastContainer";
import { CredentialsPage } from "./pages/CredentialsPage";
import {
  DashboardPage,
  type TelemetryHistory,
} from "./pages/DashboardPage";
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

const POLL_INTERVAL_MS = 4000;
const MAX_SPARK_SAMPLES = 20;

const EMPTY_HISTORY: TelemetryHistory = { ram: [], temp: [], cpu: [] };
const TAB_BY_KEY: Record<string, NavTab> = {
  "1": "dashboard",
  "2": "credentials",
  "3": "surveillance",
  "4": "terminal",
  "5": "settings",
};

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [config, setConfig] = useState<ConnectionConfig>({
    ip: "192.168.1.1",
    user: "CMCCAdmin",
    pass: "aDm8H%MdA",
    state: "checking",
    mode: "auto",
  });

  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [sysInfoUpdatedAt, setSysInfoUpdatedAt] = useState<string | null>(null);
  const [telemetryHistory, setTelemetryHistory] =
    useState<TelemetryHistory>(EMPTY_HISTORY);
  const [loadingSysInfo, setLoadingSysInfo] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [credentialsUpdatedAt, setCredentialsUpdatedAt] = useState<
    string | null
  >(null);
  const [surveillance, setSurveillance] = useState<SurveillanceStatus | null>(
    null
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const sysInfoInFlightRef = useRef(false);

  const addToast = useCallback(
    (type: ToastItem["type"], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2800);
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
      if (sysInfoInFlightRef.current) return;
      sysInfoInFlightRef.current = true;
      if (!silent) {
        setLoadingSysInfo(true);
        addLog("info", "正在实时采样设备 CPU、内存、温度与光功率...");
      }
      try {
        const info = await invoke<SystemInfo>("get_system_info", {
          ip,
          user,
          pass,
        });
        setSysInfo(info);
        setSysInfoUpdatedAt(new Date().toLocaleTimeString());
        setTelemetryHistory((prev) => ({
          ram: [...prev.ram, info.ram_usage_percent].slice(-MAX_SPARK_SAMPLES),
          temp:
            info.temperature_c !== null
              ? [...prev.temp, info.temperature_c].slice(-MAX_SPARK_SAMPLES)
              : prev.temp,
          cpu: [...prev.cpu, info.cpu_usage_percent].slice(-MAX_SPARK_SAMPLES),
        }));
        if (!silent) {
          addLog(
            "success",
            `状态已刷新：CPU ${info.cpu_usage_percent.toFixed(1)}% | 内存 ${info.ram_usage_percent}% | 温度 ${info.temperature}${
              info.rx_power_dbm !== null
                ? ` | 收光 ${info.rx_power_dbm.toFixed(1)} dBm`
                : ""
            }`
          );
          addToast("success", "设备状态已刷新");
        }
      } catch (err) {
        const e = typeof err === "string" ? err : String(err);
        if (!silent) {
          addLog("error", `读取设备状态失败: ${e}`);
          addToast("error", "读取设备状态失败");
        }
      } finally {
        sysInfoInFlightRef.current = false;
        if (!silent) setLoadingSysInfo(false);
      }
    },
    [addLog, addToast]
  );

  const fetchSurveillanceSilent = useCallback(
    async (ip: string, user: string, pass: string) => {
      try {
        const s = await invoke<SurveillanceStatus>("check_surveillance", {
          ip,
          user,
          pass,
        });
        setSurveillance(s);
      } catch {
        // Ignore silent background probe error; user can manually trigger audit
      }
    },
    []
  );

  const runAutoDetect = useCallback(
    async (targetIp?: string) => {
      const ip = targetIp || "192.168.1.1";
      setConfig((prev) => {
        if (prev.ip !== ip) {
          setTelemetryHistory(EMPTY_HISTORY);
        }
        return { ...prev, ip, state: "checking", mode: "auto" };
      });
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
          void fetchSurveillanceSilent(
            res.ip,
            res.telnet_user,
            res.telnet_pass
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
    [addLog, addToast, fetchSurveillanceSilent, fetchSystemInfoWith]
  );

  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void runAutoDetect("192.168.1.1");
  }, [runAutoDetect]);

  // Real-time dashboard auto-polling (only active on Dashboard tab while online)
  useEffect(() => {
    if (
      !autoRefresh ||
      activeTab !== "dashboard" ||
      config.state !== "online"
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchSystemInfoWith(config.ip, config.user, config.pass, true);
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [
    autoRefresh,
    activeTab,
    config.state,
    config.ip,
    config.user,
    config.pass,
    fetchSystemInfoWith,
  ]);

  // Global desktop keyboard shortcuts: ⌘1..5 tabs, ⌘R refresh dashboard, ⌘L toggle logs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const lower = e.key.toLowerCase();
      if (TAB_BY_KEY[lower]) {
        e.preventDefault();
        setActiveTab(TAB_BY_KEY[lower]);
        return;
      }
      if (lower === "l" && !isEditable) {
        e.preventDefault();
        setDrawerOpen((v) => !v);
        return;
      }
      if (lower === "r" && activeTab === "dashboard" && !isEditable) {
        e.preventDefault();
        if (config.state === "online") {
          void fetchSystemInfoWith(config.ip, config.user, config.pass);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTab,
    config.ip,
    config.pass,
    config.state,
    config.user,
    fetchSystemInfoWith,
  ]);

  const runSurveillanceAction = useCallback(
    async (action: "kill" | "restore") => {
      const meta =
        action === "kill"
          ? {
              cmd: "kill_surveillance",
              startLog: "正在停止 Java DPI / 监控容器并释放内存...",
              okToast: "已停止 Java 监控并释放内存",
              errLabel: "停止监控失败",
            }
          : {
              cmd: "restore_surveillance",
              startLog: "正在启动 Java OSGi 监控容器...",
              okToast: "已启动 Java 监控服务",
              errLabel: "启动监控失败",
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

  const handleToggleFtp = useCallback(
    async (enable: boolean) => {
      addLog(
        "info",
        `正在${enable ? "开启" : "关闭"}光猫内置 FTP 服务 (21 端口)...`
      );
      try {
        const msg = await invoke<string>("set_ftp_enabled", {
          ip: config.ip,
          enable,
        });
        addLog("success", msg);
        addToast("success", enable ? "已开启 FTP 服务" : "已关闭 FTP 服务");
        await fetchSurveillanceSilent(config.ip, config.user, config.pass);
      } catch (err) {
        const e = typeof err === "string" ? err : String(err);
        addLog("error", `修改 FTP 状态失败: ${e}`);
        addToast("error", `修改 FTP 失败: ${e.slice(0, 50)}`);
      }
    },
    [
      addLog,
      addToast,
      config.ip,
      config.pass,
      config.user,
      fetchSurveillanceSilent,
    ]
  );

  const handleToggleLanIpv6 = useCallback(
    async (enable: boolean) => {
      addLog(
        "info",
        `正在${enable ? "开启" : "关闭"}光猫 LAN 侧 IPv6 RA 与 DHCPv6 服务...`
      );
      try {
        const msg = await invoke<string>("set_lan_ipv6_enabled", {
          ip: config.ip,
          enable,
        });
        addLog("success", msg);
        addToast(
          "success",
          enable ? "已恢复 LAN IPv6 RA/DHCPv6" : "已关闭 LAN IPv6 假网关广播"
        );
        await fetchSurveillanceSilent(config.ip, config.user, config.pass);
      } catch (err) {
        const e = typeof err === "string" ? err : String(err);
        addLog("error", `修改 LAN IPv6 配置失败: ${e}`);
        addToast("error", `修改 LAN IPv6 失败: ${e.slice(0, 50)}`);
      }
    },
    [
      addLog,
      addToast,
      config.ip,
      config.pass,
      config.user,
      fetchSurveillanceSilent,
    ]
  );

  const handleManualConnected = useCallback(
    (ip: string, user: string, pass: string) => {
      setTelemetryHistory(EMPTY_HISTORY);
      void fetchSystemInfoWith(ip, user, pass, true);
      void fetchSurveillanceSilent(ip, user, pass);
    },
    [fetchSurveillanceSilent, fetchSystemInfoWith]
  );

  const handleCopyLogs = useCallback(async () => {
    if (logs.length === 0) return;
    const text = logs
      .map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      addToast("info", "已复制全部运行日志");
    } catch {
      addToast("error", "复制日志失败");
    }
  }, [addToast, logs]);

  return (
    <>
      <AppShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        config={config}
        onReconnect={() => void runAutoDetect(config.ip)}
        logs={logs}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        onClearLogs={() => setLogs([])}
        onCopyLogs={() => void handleCopyLogs()}
      >
        {activeTab === "dashboard" && (
          <DashboardPage
            config={config}
            sysInfo={sysInfo}
            sysInfoUpdatedAt={sysInfoUpdatedAt}
            telemetryHistory={telemetryHistory}
            surveillance={surveillance}
            loadingSysInfo={loadingSysInfo}
            autoRefresh={autoRefresh}
            onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
            onRefreshSysInfo={() =>
              void fetchSystemInfoWith(config.ip, config.user, config.pass)
            }
            onLog={addLog}
            onToast={addToast}
            onJumpSettings={() => setActiveTab("settings")}
            onJumpSurveillance={() => setActiveTab("surveillance")}
          />
        )}

        {activeTab === "credentials" && (
          <CredentialsPage
            config={config}
            credentials={credentials}
            lastUpdated={credentialsUpdatedAt}
            onCredentialsLoaded={(creds, ts) => {
              setCredentials(creds);
              setCredentialsUpdatedAt(ts);
            }}
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
            onToggleFtp={handleToggleFtp}
            onToggleLanIpv6={handleToggleLanIpv6}
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
            onManualConnected={handleManualConnected}
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
