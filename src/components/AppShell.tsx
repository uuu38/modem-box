import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronUp,
  Copy,
  KeyRound,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  ShieldAlert,
  Terminal,
  Trash2,
} from "lucide-react";
import type { ConnectionConfig, LogEntry } from "../types/modem";
import { Badge, Button, Kbd, cn } from "./ui/primitives";

export type NavTab =
  | "dashboard"
  | "credentials"
  | "surveillance"
  | "terminal"
  | "settings";

interface AppShellProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  config: ConnectionConfig;
  onReconnect: () => void;
  logs: LogEntry[];
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onClearLogs: () => void;
  onCopyLogs: () => void;
  children: React.ReactNode;
}

const CORE_NAV: {
  id: NavTab;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "dashboard", label: "概览仪表盘", shortcut: "⌘1", icon: LayoutDashboard },
  { id: "credentials", label: "核心凭据库", shortcut: "⌘2", icon: KeyRound },
  { id: "surveillance", label: "安全审计与加固", shortcut: "⌘3", icon: ShieldAlert },
];

const TOOL_NAV: {
  id: NavTab;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "terminal", label: "快捷终端", shortcut: "⌘4", icon: Terminal },
  { id: "settings", label: "连接设置", shortcut: "⌘5", icon: Settings },
];

export function AppShell({
  activeTab,
  onTabChange,
  config,
  onReconnect,
  logs,
  drawerOpen,
  onToggleDrawer,
  onClearLogs,
  onCopyLogs,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (drawerOpen && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [drawerOpen, logs]);

  const latestLog = logs[logs.length - 1];
  const isChecking = config.state === "checking";
  const isOnline = config.state === "online";

  const renderNavButton = (item: (typeof CORE_NAV)[number]) => {
    const Icon = item.icon;
    const active = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onTabChange(item.id)}
        title={collapsed ? `${item.label} (${item.shortcut})` : undefined}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-all duration-150 cursor-pointer",
          active
            ? "bg-[#1A2332] text-[#F1F5F9] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
            : "text-[#94A3B8] hover:bg-white/[0.04] hover:text-[#F1F5F9]",
          collapsed && "justify-center px-0"
        )}
      >
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#14B8A6]" />
        )}
        <Icon
          className={cn("h-4 w-4 shrink-0", active && "text-[#14B8A6]")}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left">{item.label}</span>
            <Kbd
              className={cn(
                "transition-opacity",
                active
                  ? "opacity-75"
                  : "opacity-0 group-hover:opacity-75"
              )}
            >
              {item.shortcut}
            </Kbd>
          </>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0B0F19] text-[#F1F5F9]">
      {/* Top Status Bar (52px) */}
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#151B28]/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#14B8A6]/30 bg-[#14B8A6]/15 text-[#14B8A6]">
            <Activity className="h-4 w-4" />
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-[#F1F5F9]">
            ModemBox
          </span>
          <Badge tone="neutral">v0.6.0</Badge>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Clickable Live Connection Pill -> opens Settings */}
          <button
            type="button"
            onClick={() => onTabChange("settings")}
            title="点击管理连接与 Telnet 凭据设置"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium transition-all cursor-pointer hover:brightness-110",
              isOnline &&
                "border-[#10B981]/30 bg-[#10B981]/10 text-[#34D399]",
              isChecking &&
                "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#FBBF24]",
              !isOnline &&
                !isChecking &&
                "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#F87171]"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isOnline && "bg-[#10B981] animate-pulse",
                isChecking && "bg-[#F59E0B] animate-pulse",
                !isOnline && !isChecking && "bg-[#EF4444]"
              )}
            />
            <span className="font-mono tabular-nums">{config.ip}:23</span>
            <span className="opacity-60">·</span>
            <span>
              {isOnline ? "已连通" : isChecking ? "探测中..." : "未连接"}
            </span>
            <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px] opacity-80">
              {config.mode === "auto" ? "自动" : "手动"}
            </span>
          </button>

          <Button
            variant="secondary"
            size="sm"
            disabled={isChecking}
            onClick={onReconnect}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isChecking && "animate-spin")}
            />
            重连
          </Button>
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex min-h-0 flex-1">
        {/* Collapsible Sidebar */}
        <aside
          className={cn(
            "flex shrink-0 flex-col border-r border-white/[0.08] bg-[#151B28]/55 p-3 transition-[width] duration-200 ease-out",
            collapsed ? "w-[68px]" : "w-[224px]"
          )}
        >
          <div className="mb-2 flex items-center justify-between px-2">
            {!collapsed && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7E91AA]">
                核心功能
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "展开侧边栏" : "收起侧边栏"}
              className="ml-auto"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>

          <nav className="space-y-1">{CORE_NAV.map(renderNavButton)}</nav>

          <div className="my-4 border-t border-white/[0.06]" />

          {!collapsed && (
            <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-[#7E91AA]">
              工具与配置
            </div>
          )}

          <nav className="space-y-1">{TOOL_NAV.map(renderNavButton)}</nav>

          {!collapsed && (
            <div className="mt-auto rounded-[8px] border border-white/[0.06] bg-[#0B0F19]/65 px-3 py-2.5 text-[11px] leading-relaxed text-[#7E91AA]">
              <div className="font-medium text-[#94A3B8]">
                天邑 / 烽火定制网关
              </div>
              <div className="mt-0.5 flex items-center justify-between">
                <span>Tauri 2.0 · Rust</span>
                <span className="font-mono text-[10px]">⌘L 日志</span>
              </div>
            </div>
          )}
        </aside>

        {/* Scrollable Workspace */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          {/* Actionable Offline Banner when disconnected (hidden on Settings page) */}
          {config.state === "offline" && activeTab !== "settings" && (
            <div className="mx-auto mb-5 flex w-full max-w-[1040px] items-center justify-between gap-4 rounded-[10px] border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-[12px] text-[#FCA5A5]">
              <div className="flex min-w-0 items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#F87171]" />
                <span className="truncate">
                  光猫 <span className="font-mono font-semibold">{config.ip}:23</span> 暂未连通 — 请确认已接入光猫局域网，或手动检查 IP 与 Telnet 开关。
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={onReconnect}>
                  重新探测
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#FCA5A5] hover:text-white"
                  onClick={() => onTabChange("settings")}
                >
                  前往设置 →
                </Button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </div>

      {/* Bottom Collapsible Log Drawer */}
      <footer className="shrink-0 border-t border-white/[0.08] bg-[#151B28]">
        <div
          onClick={onToggleDrawer}
          title="展开或收起运行日志 (⌘L)"
          className="flex h-9 cursor-pointer items-center justify-between px-4 transition-colors hover:bg-[#1A2332]/75"
        >
          <div className="flex min-w-0 items-center gap-2.5 text-[12px]">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                latestLog?.level === "error"
                  ? "bg-[#EF4444]"
                  : latestLog?.level === "warn"
                  ? "bg-[#F59E0B]"
                  : latestLog?.level === "success"
                  ? "bg-[#10B981]"
                  : "bg-[#14B8A6]"
              )}
            />
            <span className="shrink-0 font-semibold text-[#F1F5F9]">
              运行日志
            </span>
            <Badge tone="neutral">{logs.length}</Badge>
            <span className="truncate font-mono text-[11.5px] text-[#94A3B8]">
              {latestLog
                ? `[${latestLog.time}] ${latestLog.message.split("\n")[0]}`
                : "// 等待执行操作..."}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              disabled={logs.length === 0}
              onClick={(e) => {
                e.stopPropagation();
                onCopyLogs();
              }}
            >
              <Copy className="h-3 w-3" />
              复制
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              disabled={logs.length === 0}
              onClick={(e) => {
                e.stopPropagation();
                onClearLogs();
              }}
            >
              <Trash2 className="h-3 w-3" />
              清空
            </Button>
            <ChevronUp
              className={cn(
                "ml-1 h-4 w-4 text-[#94A3B8] transition-transform duration-200",
                drawerOpen && "rotate-180"
              )}
            />
          </div>
        </div>

        {drawerOpen && (
          <div
            ref={logContainerRef}
            className="h-48 select-text overflow-y-auto border-t border-white/[0.08] bg-[#070A12] px-4 py-2.5 font-mono text-[12px] leading-relaxed"
          >
            {logs.length === 0 ? (
              <span className="text-[#7E91AA]">// 暂无日志记录</span>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className="flex gap-2.5 whitespace-pre-wrap border-b border-white/[0.03] py-1 last:border-b-0"
                >
                  <span className="shrink-0 text-[#7E91AA]">
                    [{entry.time}]
                  </span>
                  <span
                    className={cn(
                      entry.level === "error" && "text-[#F87171]",
                      entry.level === "warn" && "text-[#FBBF24]",
                      entry.level === "success" && "text-[#34D399]",
                      entry.level === "info" && "text-[#94A3B8]"
                    )}
                  >
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
