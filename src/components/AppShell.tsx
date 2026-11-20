import { useState } from "react";
import {
  Activity,
  ChevronUp,
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
import { Badge, Button, cn } from "./ui/primitives";

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
  onModeChange: (mode: "auto" | "manual") => void;
  onReconnect: () => void;
  logs: LogEntry[];
  onClearLogs: () => void;
  children: React.ReactNode;
}

const CORE_NAV: {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "dashboard", label: "概览仪表盘", icon: LayoutDashboard },
  { id: "credentials", label: "核心凭据库", icon: KeyRound },
  { id: "surveillance", label: "监控与清理", icon: ShieldAlert },
];

const TOOL_NAV: {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "terminal", label: "快捷终端", icon: Terminal },
  { id: "settings", label: "连接设置", icon: Settings },
];

export function AppShell({
  activeTab,
  onTabChange,
  config,
  onModeChange,
  onReconnect,
  logs,
  onClearLogs,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13px] font-medium transition-all duration-150 cursor-pointer",
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
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0B0F19] text-[#F1F5F9]">
      {/* Top Status Bar (56px) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#151B28]/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#14B8A6]/30 bg-[#14B8A6]/15 text-[#14B8A6]">
            <Activity className="h-4 w-4" />
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-[#F1F5F9]">
            ModemBox
          </span>
          <Badge tone="neutral">v0.4.0</Badge>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Connection Pill */}
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium",
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
            <span>
              ·{" "}
              {isOnline
                ? "已连通"
                : isChecking
                ? "探测中..."
                : "未连接"}
            </span>
          </div>

          {/* Mode Switcher */}
          <div className="inline-flex rounded-[8px] border border-white/[0.08] bg-[#0B0F19] p-0.5">
            {(["auto", "manual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                className={cn(
                  "rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all cursor-pointer",
                  config.mode === m
                    ? "bg-[#1A2332] text-[#14B8A6] shadow-sm"
                    : "text-[#94A3B8] hover:text-[#F1F5F9]"
                )}
              >
                {m === "auto" ? "自动模式" : "手动模式"}
              </button>
            ))}
          </div>

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
            collapsed ? "w-[68px]" : "w-[232px]"
          )}
        >
          <div className="mb-2 flex items-center justify-between px-2">
            {!collapsed && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
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
            <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
              工具与配置
            </div>
          )}

          <nav className="space-y-1">{TOOL_NAV.map(renderNavButton)}</nav>

          {!collapsed && (
            <div className="mt-auto rounded-[8px] border border-white/[0.06] bg-[#0B0F19]/65 px-3 py-2.5 text-[11px] leading-relaxed text-[#64748B]">
              <div className="font-medium text-[#94A3B8]">
                天邑 / 烽火定制网关
              </div>
              <div>Tauri 2.0 · Rust 异步引擎</div>
            </div>
          )}
        </aside>

        {/* Scrollable Workspace */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      {/* Bottom Collapsible Log Drawer */}
      <footer className="shrink-0 border-t border-white/[0.08] bg-[#151B28]">
        <div
          onClick={() => setDrawerOpen((o) => !o)}
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

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
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
                "h-4 w-4 text-[#94A3B8] transition-transform duration-200",
                drawerOpen && "rotate-180"
              )}
            />
          </div>
        </div>

        {drawerOpen && (
          <div className="h-48 select-text overflow-y-auto border-t border-white/[0.08] bg-[#070A12] px-4 py-3 font-mono text-[12px] leading-relaxed">
            {logs.length === 0 ? (
              <span className="text-[#64748B]">// 暂无日志记录</span>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className="flex gap-2.5 whitespace-pre-wrap py-0.5"
                >
                  <span className="shrink-0 text-[#64748B]">
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
