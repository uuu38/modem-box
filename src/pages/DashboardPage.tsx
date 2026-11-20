import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Cpu,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldOff,
  TerminalSquare,
  Wifi,
} from "lucide-react";
import { CredentialRow } from "../components/CredentialRow";
import { Badge, Button, Card, cn } from "../components/ui/primitives";
import type { ConnectionConfig, LogLevel, SystemInfo } from "../types/modem";

interface DashboardPageProps {
  config: ConnectionConfig;
  sysInfo: SystemInfo | null;
  loadingSysInfo: boolean;
  onRefreshSysInfo: () => void;
  onKillSurveillance: () => Promise<void>;
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
  onLog,
  onToast,
  onJumpSettings,
}: DashboardPageProps) {
  const [testingHandshake, setTestingHandshake] = useState(false);
  const [killing, setKilling] = useState(false);

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

  const handleKillClick = async () => {
    setKilling(true);
    try {
      await onKillSurveillance();
    } finally {
      setKilling(false);
    }
  };

  const ramPct = sysInfo?.ram_usage_percent ?? 0;
  const highRam = ramPct >= 75;

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#F1F5F9]">
            概览仪表盘
          </h1>
          <p className="mt-1 text-[13px] text-[#94A3B8]">
            实时掌握光猫链路状态、Telnet 通道凭据与系统内存资源
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
          刷新设备状态
        </Button>
      </div>

      {/* 状态横幅 */}
      <Card className="relative overflow-hidden border-[#14B8A6]/25 bg-gradient-to-r from-[#151B28] via-[#151B28] to-[#14B8A6]/[0.07] p-5">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-[11px] font-medium text-[#94A3B8]">
                目标网关
              </div>
              <div className="mt-1 font-mono text-[14px] font-semibold tabular-nums text-[#F1F5F9]">
                {config.ip}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[#94A3B8]">
                光路状态 (PON)
              </div>
              <div className="mt-1 text-[13px] font-semibold text-[#F1F5F9]">
                {sysInfo?.pon_status ?? "待读取"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[#94A3B8]">
                工作模式
              </div>
              <div className="mt-1 text-[13px] font-semibold text-[#F1F5F9]">
                {sysInfo?.wan_mode ?? "待读取"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[#94A3B8]">
                连续运行时间
              </div>
              <div className="mt-1 text-[13px] font-semibold text-[#F1F5F9]">
                {sysInfo?.uptime ?? "—"}
              </div>
            </div>
          </div>

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
            测试 Telnet 握手
          </Button>
        </div>
      </Card>

      {/* 双列 Bento 核心卡片 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Card: Telnet 通道 */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#14B8A6]/12 text-[#14B8A6]">
                <TerminalSquare className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-[#F1F5F9]">
                  Telnet 通道与凭据
                </h2>
                <p className="text-[12px] text-[#94A3B8]">
                  自动从光猫免密同步，可用于外部终端直连
                </p>
              </div>
            </div>

            <Badge tone={config.state === "online" ? "success" : "danger"}>
              {config.state === "online" ? "23 端口在线" : "23 端口离线"}
            </Badge>
          </div>

          <div className="space-y-2.5">
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

          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onJumpSettings}>
              修改 IP 或自定义密码 →
            </Button>
          </div>
        </Card>

        {/* Card: 内存与温度 */}
        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#F59E0B]/12 text-[#F59E0B]">
                  <HardDrive className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#F1F5F9]">
                    内存占用与温控
                  </h2>
                  <p className="text-[12px] text-[#94A3B8]">
                    停用 Java OSGi 容器可显著降低内存与发热量
                  </p>
                </div>
              </div>

              <Badge tone="neutral">
                温度: {sysInfo?.temperature ?? "--"}
              </Badge>
            </div>

            <div className="rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 p-3.5">
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="text-[#94A3B8]">
                  已用{" "}
                  <span className="font-mono font-semibold text-[#F1F5F9]">
                    {sysInfo ? `${sysInfo.ram_used_mb} MB` : "--"}
                  </span>{" "}
                  / 总计{" "}
                  <span className="font-mono text-[#94A3B8]">
                    {sysInfo ? `${sysInfo.ram_total_mb} MB` : "--"}
                  </span>
                </span>
                <span
                  className={cn(
                    "font-mono text-[13px] font-bold tabular-nums",
                    highRam ? "text-[#F59E0B]" : "text-[#14B8A6]"
                  )}
                >
                  {sysInfo ? `${ramPct}%` : "--%"}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#0B0F19]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    highRam
                      ? "bg-gradient-to-r from-[#F59E0B] to-[#EF4444]"
                      : "bg-gradient-to-r from-[#14B8A6] to-[#10B981]"
                  )}
                  style={{ width: `${Math.min(ramPct, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              variant="danger"
              size="sm"
              disabled={killing || config.state !== "online"}
              onClick={handleKillClick}
            >
              {killing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              一键释放 Java 监控内存
            </Button>
          </div>
        </Card>
      </div>

      {/* Hardware Info Card */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[#F1F5F9]">
              硬件与系统内核参数
            </h2>
            <p className="text-[12px] text-[#94A3B8]">
              实时采集自 /proc/cpuinfo 与系统内核信息
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-3.5 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">CPU 架构 / 型号</div>
            <div className="mt-1 truncate font-mono text-[13px] font-medium text-[#F1F5F9]">
              {sysInfo?.cpu_model ?? "—"}
            </div>
          </div>
          <div className="rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-3.5 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">处理器核心数</div>
            <div className="mt-1 font-mono text-[13px] font-medium text-[#F1F5F9]">
              {sysInfo ? `${sysInfo.cpu_cores} 核` : "—"}
            </div>
          </div>
          <div className="rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-3.5 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">Linux 内核版本</div>
            <div className="mt-1 truncate font-mono text-[13px] font-medium text-[#F1F5F9]">
              {sysInfo?.kernel_version ?? "—"}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
