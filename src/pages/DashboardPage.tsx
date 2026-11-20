import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Gauge,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldOff,
  TerminalSquare,
  Wifi,
} from "lucide-react";
import { CredentialRow } from "../components/CredentialRow";
import { RadialGauge } from "../components/RadialGauge";
import { Badge, Button, Card } from "../components/ui/primitives";
import type { ConnectionConfig, LogLevel, SystemInfo } from "../types/modem";

interface DashboardPageProps {
  config: ConnectionConfig;
  sysInfo: SystemInfo | null;
  loadingSysInfo: boolean;
  onRefreshSysInfo: () => void;
  onKillSurveillance: () => Promise<void>;
  onRestoreSurveillance: () => Promise<void>;
  onLog: (level: LogLevel, msg: string) => void;
  onToast: (type: "success" | "error" | "info", msg: string) => void;
  onJumpSettings: () => void;
}

export function DashboardPage({
  config,
  sysInfo,
  loadingSysInfo,
  onRefreshSysInfo,
  onKillSurveillance,
  onRestoreSurveillance,
  onLog,
  onToast,
  onJumpSettings,
}: DashboardPageProps) {
  const [testingHandshake, setTestingHandshake] = useState(false);
  const [survBusy, setSurvBusy] = useState<"kill" | "restore" | null>(null);

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

  const runSurvAction = async (mode: "kill" | "restore") => {
    setSurvBusy(mode);
    try {
      await (mode === "kill" ? onKillSurveillance() : onRestoreSurveillance());
    } finally {
      setSurvBusy(null);
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

  // Temp gauge tone & text
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

  // CPU load gauge tone & text
  const cpuPct = sysInfo ? sysInfo.cpu_load_percent : null;
  const cpuTone =
    cpuPct === null
      ? "neutral"
      : cpuPct >= 85
      ? "danger"
      : cpuPct >= 65
      ? "warning"
      : "teal";
  const cpuStatus =
    cpuPct === null
      ? "待读取"
      : cpuPct >= 85
      ? "高负载"
      : cpuPct >= 65
      ? "中等负载"
      : "流畅运行";

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#F1F5F9]">
            概览仪表盘
          </h1>
          <p className="mt-1 text-[13px] text-[#94A3B8]">
            一屏总览光猫硬件仪表盘、内存温控指标与 Telnet 管理通道
          </p>
        </div>

        <Button
          variant="primary"
          disabled={loadingSysInfo || config.state !== "online"}
          onClick={onRefreshSysInfo}
        >
          {loadingSysInfo ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          刷新仪表盘
        </Button>
      </div>

      {/* Unified Card 1: 硬件健康仪表盘（内存、温度、CPU负载 + 所有硬件规格参数） */}
      <Card className="relative overflow-hidden p-5">
        <div className="absolute left-0 top-5 bottom-5 w-[3px] rounded-r-full bg-[#14B8A6]" />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#14B8A6]/12 text-[#14B8A6]">
              <Gauge className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-[#F1F5F9]">
                硬件健康仪表盘
              </h2>
              <p className="text-[12px] text-[#94A3B8]">
                实时采集内存占用、SoC 温度、CPU 负载与底层硬件参数
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={survBusy !== null || config.state !== "online"}
              onClick={() => void runSurvAction("restore")}
            >
              {survBusy === "restore" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              恢复监控
            </Button>

            <Button
              variant="danger"
              size="sm"
              disabled={survBusy !== null || config.state !== "online"}
              onClick={() => void runSurvAction("kill")}
            >
              {survBusy === "kill" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              一键释放 Java 监控内存
            </Button>
          </div>
        </div>

        {/* 3 枚环形表盘 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <RadialGauge
            title="内存占用率 (RAM)"
            valueText={ramPct !== null ? `${ramPct}%` : "--%"}
            percent={ramPct}
            statusText={ramStatus}
            tone={ramTone}
            subText={
              sysInfo
                ? `已用 ${sysInfo.ram_used_mb} / ${sysInfo.ram_total_mb} MB`
                : "等待连接读取"
            }
          />

          <RadialGauge
            title="芯片实时温度 (SoC)"
            valueText={sysInfo ? sysInfo.temperature : "--°C"}
            percent={tempC}
            statusText={tempStatus}
            tone={tempTone}
            subText={
              tempC !== null
                ? "安全工作阈值 < 80°C"
                : sysInfo
                ? "当前固件未开放温度节点"
                : "等待连接读取"
            }
          />

          <RadialGauge
            title="CPU 综合负载"
            valueText={cpuPct !== null ? `${cpuPct}%` : "--%"}
            percent={cpuPct}
            statusText={cpuStatus}
            tone={cpuTone}
            subText={
              sysInfo
                ? `1m Load ${sysInfo.cpu_load_1m.toFixed(2)} · ${sysInfo.cpu_cores} 核心`
                : "等待连接读取"
            }
          />
        </div>

        {/* 整合在卡片底部的完整硬件与链路规格参数 */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-[8px] border border-white/[0.06] bg-[#1A2332]/75 px-3 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">处理器架构</div>
            <div
              title={sysInfo?.cpu_model ?? ""}
              className="mt-1 truncate font-mono text-[12.5px] font-medium text-[#F1F5F9]"
            >
              {sysInfo ? `${sysInfo.cpu_model}` : "—"}
            </div>
          </div>

          <div className="rounded-[8px] border border-white/[0.06] bg-[#1A2332]/75 px-3 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">Linux 内核</div>
            <div
              title={sysInfo?.kernel_version ?? ""}
              className="mt-1 truncate font-mono text-[12.5px] font-medium text-[#F1F5F9]"
            >
              {sysInfo?.kernel_version ?? "—"}
            </div>
          </div>

          <div className="rounded-[8px] border border-white/[0.06] bg-[#1A2332]/75 px-3 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">光路状态 (PON)</div>
            <div className="mt-1 truncate text-[12.5px] font-medium text-[#F1F5F9]">
              {sysInfo?.pon_status ?? "—"}
            </div>
          </div>

          <div className="rounded-[8px] border border-white/[0.06] bg-[#1A2332]/75 px-3 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">转发模式</div>
            <div className="mt-1 truncate text-[12.5px] font-medium text-[#F1F5F9]">
              {sysInfo?.wan_mode ?? "—"}
            </div>
          </div>

          <div className="col-span-2 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/75 px-3 py-2.5 sm:col-span-1">
            <div className="text-[11px] text-[#94A3B8]">连续运行</div>
            <div className="mt-1 truncate text-[12.5px] font-medium text-[#F1F5F9]">
              {sysInfo?.uptime ?? "—"}
            </div>
          </div>
        </div>
      </Card>

      {/* Card 2: Telnet 管理通道 */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#10B981]/12 text-[#10B981]">
              <TerminalSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold text-[#F1F5F9]">
                  Telnet 管理通道
                </h2>
                <Badge tone={config.state === "online" ? "success" : "danger"}>
                  {config.state === "online" ? "23 端口在线" : "23 端口离线"}
                </Badge>
              </div>
              <p className="text-[12px] text-[#94A3B8]">
                自动从光猫免密同步，支持本地终端登录与后续凭据提取
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <CredentialRow
            label="网关 IP"
            value={config.ip}
            onCopied={(l) => onToast("info", `已复制${l}`)}
          />
          <CredentialRow
            label="Telnet 账号"
            value={config.user}
            onCopied={(l) => onToast("info", `已复制${l}`)}
          />
          <CredentialRow
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
