import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  ChevronRight,
  Clock,
  Cpu,
  Gauge,
  GitBranch,
  Layers,
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  Wifi,
} from "lucide-react";
import { CredentialRow } from "../components/CredentialRow";
import { RadialGauge } from "../components/RadialGauge";
import { Badge, Button, Card, Kbd, cn } from "../components/ui/primitives";
import type {
  ConnectionConfig,
  LogLevel,
  SurveillanceStatus,
  SystemInfo,
} from "../types/modem";

export interface TelemetryHistory {
  ram: number[];
  temp: number[];
  cpu: number[];
}

interface DashboardPageProps {
  config: ConnectionConfig;
  sysInfo: SystemInfo | null;
  sysInfoUpdatedAt: string | null;
  telemetryHistory: TelemetryHistory;
  surveillance: SurveillanceStatus | null;
  loadingSysInfo: boolean;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onRefreshSysInfo: () => void;
  onLog: (level: LogLevel, msg: string) => void;
  onToast: (type: "success" | "error" | "info", msg: string) => void;
  onJumpSettings: () => void;
  onJumpSurveillance: () => void;
}

export function DashboardPage({
  config,
  sysInfo,
  sysInfoUpdatedAt,
  telemetryHistory,
  surveillance,
  loadingSysInfo,
  autoRefresh,
  onToggleAutoRefresh,
  onRefreshSysInfo,
  onLog,
  onToast,
  onJumpSettings,
  onJumpSurveillance,
}: DashboardPageProps) {
  const [testingHandshake, setTestingHandshake] = useState(false);

  const handleTestHandshake = async () => {
    setTestingHandshake(true);
    onLog("info", `正在测试 Telnet 握手 (${config.ip})...`);
    try {
      const msg = await invoke<string>("test_telnet", {
        ip: config.ip,
        user: config.user,
        pass: config.pass,
      });
      onLog("success", msg);
      onToast("success", "Telnet 握手连通成功");
    } catch (err) {
      const e = typeof err === "string" ? err : String(err);
      onLog("error", `Telnet 握手失败: ${e}`);
      onToast("error", "Telnet 握手失败");
    } finally {
      setTestingHandshake(false);
    }
  };

  // RAM gauge tone & text
  const ramPct = sysInfo ? sysInfo.ram_usage_percent : null;
  const ramTone =
    ramPct === null
      ? "neutral"
      : ramPct >= 85
      ? "danger"
      : ramPct >= 70
      ? "warning"
      : "teal";
  const ramStatus =
    ramPct === null
      ? "待读取"
      : ramPct >= 85
      ? "高压占用"
      : ramPct >= 70
      ? "偏高"
      : "充足流畅";

  // Temp gauge tone & text (mapped 25°C ~ 90°C for accurate urgency)
  const tempC = sysInfo?.temperature_c ?? null;
  const tempTone =
    tempC === null
      ? "neutral"
      : tempC >= 80
      ? "danger"
      : tempC >= 65
      ? "warning"
      : "success";
  const tempStatus =
    tempC === null
      ? sysInfo
        ? "无传感器"
        : "待读取"
      : tempC >= 80
      ? "过热告警"
      : tempC >= 65
      ? "略微偏高"
      : "温度正常";

  // Real-time CPU usage gauge tone & text (/proc/stat delta)
  const cpuPct = sysInfo ? sysInfo.cpu_usage_percent : null;
  const cpuTone =
    cpuPct === null
      ? "neutral"
      : cpuPct >= 85
      ? "danger"
      : cpuPct >= 60
      ? "warning"
      : "teal";
  const cpuStatus =
    cpuPct === null
      ? "待读取"
      : cpuPct >= 85
      ? "高占用"
      : cpuPct >= 60
      ? "中等占用"
      : "低载流畅";

  // Security summary pill for clean IA handoff to SurveillancePage
  const riskCount = surveillance
    ? [
        surveillance.java_running,
        surveillance.tr069_wan_enabled,
        surveillance.mirror_active,
        surveillance.ipv6_ra_enabled || surveillance.dhcpv6_enabled,
        surveillance.ftp_enabled || surveillance.ftp_running,
        surveillance.external_connections.length > 0,
      ].filter(Boolean).length
    : null;

  // Optical RX/TX formatting & health color
  const rx = sysInfo?.rx_power_dbm ?? null;
  const tx = sysInfo?.tx_power_dbm ?? null;
  const opticalText =
    rx !== null && tx !== null
      ? `${rx.toFixed(1)} / ${tx >= 0 ? "+" : ""}${tx.toFixed(1)} dBm`
      : rx !== null
      ? `RX ${rx.toFixed(1)} dBm`
      : "—";
  const opticalColor =
    rx === null
      ? "text-[#F1F5F9]"
      : rx < -27 || rx > -8
      ? "text-[#F87171]"
      : rx < -25 || rx > -10
      ? "text-[#FBBF24]"
      : "text-[#34D399]";

  const deviceTitle = sysInfo
    ? [sysInfo.model_name, sysInfo.soc_chip].filter(Boolean).join(" · ") ||
      sysInfo.cpu_model
    : "—";

  const kernelTitle = sysInfo
    ? [sysInfo.kernel_version, sysInfo.software_version]
        .filter(Boolean)
        .join(" · ")
    : "—";

  const specItems = [
    {
      label: "型号 / 芯片",
      value: deviceTitle,
      icon: Cpu,
      mono: true,
      colorClass: "text-[#F1F5F9]",
    },
    {
      label: "光功率 (RX / TX)",
      value: opticalText,
      icon: Radio,
      mono: true,
      colorClass: opticalColor,
    },
    {
      label: "光路状态 (PON)",
      value: sysInfo?.pon_status ?? "—",
      icon: Activity,
      mono: false,
      colorClass:
        sysInfo?.pon_status.includes("已注册") ? "text-[#34D399]" : "text-[#F1F5F9]",
    },
    {
      label: "转发模式",
      value: sysInfo?.wan_mode ?? "—",
      icon: GitBranch,
      mono: false,
      colorClass: "text-[#F1F5F9]",
    },
    {
      label: "内核 / 固件",
      value: kernelTitle,
      icon: Layers,
      mono: true,
      colorClass: "text-[#F1F5F9]",
    },
    {
      label: "连续运行",
      value: sysInfo?.uptime ?? "—",
      icon: Clock,
      mono: false,
      colorClass: "text-[#F1F5F9]",
    },
  ];

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-semibold tracking-tight text-[#F1F5F9]">
              概览仪表盘
            </h1>
            {sysInfoUpdatedAt && (
              <Badge tone="neutral" className="font-mono tabular-nums">
                更新于 {sysInfoUpdatedAt}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[12px] text-[#94A3B8]">
            实时采样 /proc/stat 真实 CPU、内存、SoC/光模块温控与 GPON 光功率指标
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={config.state !== "online"}
            onClick={onToggleAutoRefresh}
            title={
              autoRefresh
                ? "点击暂停每 4 秒自动采样"
                : "点击开启每 4 秒自动实时采样"
            }
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-[8px] border px-3 text-[12px] font-medium transition-all cursor-pointer disabled:opacity-45",
              autoRefresh && config.state === "online"
                ? "border-[#14B8A6]/35 bg-[#14B8A6]/12 text-[#2DD4BF] hover:bg-[#14B8A6]/18"
                : "border-white/[0.1] bg-[#1A2332] text-[#94A3B8] hover:text-[#F1F5F9]"
            )}
          >
            {autoRefresh && config.state === "online" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[#14B8A6] animate-pulse" />
                <span>实时 · 4s</span>
                <Pause className="h-3 w-3 opacity-80" />
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                <span>已暂停</span>
              </>
            )}
          </button>

          <Button
            variant="primary"
            disabled={loadingSysInfo || config.state !== "online"}
            onClick={onRefreshSysInfo}
            title="立即采样刷新 (⌘R)"
          >
            {loadingSysInfo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            刷新
            <Kbd className="border-black/20 bg-black/15 text-[#042F2E]">⌘R</Kbd>
          </Button>
        </div>
      </div>

      {/* Unified Card 1: 硬件健康仪表盘（纯监控职责 + 安全加固状态入口） */}
      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-[#14B8A6]/60 via-[#14B8A6]/20 to-transparent" />

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#14B8A6]/12 text-[#14B8A6]">
              <Gauge className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-[#F1F5F9]">
                硬件健康仪表盘
              </h2>
              <p className="truncate text-[12px] text-[#94A3B8]">
                实时记录最近 20 次采样趋势，温度刻度映射 25°C ~ 90°C
              </p>
            </div>
          </div>

          {/* Clean Security Audit Status Handoff Pill */}
          {riskCount !== null && (
            <button
              type="button"
              onClick={onJumpSurveillance}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all cursor-pointer hover:brightness-110",
                riskCount === 0
                  ? "border-[#10B981]/30 bg-[#10B981]/10 text-[#34D399]"
                  : "border-[#F59E0B]/35 bg-[#F59E0B]/12 text-[#FBBF24]"
              )}
            >
              {riskCount === 0 ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>安全达标 · 零外联</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>{riskCount} 项待加固 · 前往处理</span>
                </>
              )}
              <ChevronRight className="h-3.5 w-3.5 opacity-80" />
            </button>
          )}
        </div>

        {/* 3 枚环形表盘 + 实时趋势折线 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <RadialGauge
            title="内存占用率 (RAM)"
            valueText={ramPct !== null ? `${ramPct}%` : "--%"}
            value={ramPct}
            minScale={0}
            maxScale={100}
            statusText={ramStatus}
            tone={ramTone}
            history={telemetryHistory.ram}
            subText={
              sysInfo
                ? `已用 ${sysInfo.ram_used_mb} / ${sysInfo.ram_total_mb} MB`
                : "等待连接读取"
            }
          />

          <RadialGauge
            title="芯片实时温度 (SoC)"
            valueText={sysInfo ? sysInfo.temperature : "--°C"}
            value={tempC}
            minScale={25}
            maxScale={90}
            statusText={tempStatus}
            tone={tempTone}
            history={telemetryHistory.temp}
            subText={
              sysInfo?.optical_temp_c !== null &&
              sysInfo?.optical_temp_c !== undefined
                ? `光模块 ${sysInfo.optical_temp_c.toFixed(1)}°C · 告警 80°C`
                : tempC !== null
                ? "安全工作阈值 < 80°C"
                : sysInfo
                ? "当前固件未开放温度节点"
                : "等待连接读取"
            }
          />

          <RadialGauge
            title="CPU 实时占用"
            valueText={cpuPct !== null ? `${cpuPct.toFixed(1)}%` : "--%"}
            value={cpuPct}
            minScale={0}
            maxScale={100}
            statusText={cpuStatus}
            tone={cpuTone}
            history={telemetryHistory.cpu}
            subText={
              sysInfo
                ? `${sysInfo.cpu_cores} 核心 · 1m Load ${sysInfo.cpu_load_1m.toFixed(2)}`
                : "等待连接读取"
            }
          />
        </div>

        {/* 3×2 硬件与光路规格网格（在 1080px 窗口下每格 ~245px，零截断 + 可选中复制） */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {specItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-[8px] border border-white/[0.06] bg-[#1A2332]/75 px-3.5 py-2.5 transition-colors hover:border-white/[0.11]"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#7E91AA]">
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                  <span>{item.label}</span>
                </div>
                <div
                  title={item.value}
                  className={cn(
                    "mt-1 truncate select-text text-[13px] font-medium tabular-nums",
                    item.mono && "font-mono",
                    item.colorClass
                  )}
                >
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Card 2: Telnet 管理通道 */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#10B981]/12 text-[#10B981]">
              <TerminalSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-[#F1F5F9]">
                  Telnet 管理通道
                </h2>
                <Badge tone={config.state === "online" ? "success" : "danger"}>
                  {config.state === "online" ? "23 端口在线" : "23 端口离线"}
                </Badge>
              </div>
              <p className="truncate text-[12px] text-[#94A3B8]">
                自动从光猫免密同步，支持终端排障与底层硬件采集
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={testingHandshake || config.state !== "online"}
              onClick={handleTestHandshake}
            >
              {testingHandshake ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wifi className="h-3.5 w-3.5 text-[#14B8A6]" />
              )}
              测试握手
            </Button>
            <Button variant="ghost" size="sm" onClick={onJumpSettings}>
              修改设置 →
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CredentialRow
            compact
            label="网关 IP"
            value={config.ip}
            onCopied={(l) => onToast("info", `已复制${l}`)}
          />
          <CredentialRow
            compact
            label="Telnet 账号"
            value={config.user}
            onCopied={(l) => onToast("info", `已复制${l}`)}
          />
          <CredentialRow
            compact
            label="Telnet 密码"
            value={config.pass}
            isSecret
            onCopied={(l) => onToast("info", `已复制${l}`)}
          />
        </div>
      </Card>
    </div>
  );
}
