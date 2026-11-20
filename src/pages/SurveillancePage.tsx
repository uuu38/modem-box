import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  Loader2,
  Network,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Badge, Button, Card } from "../components/ui/primitives";
import type {
  ConnectionConfig,
  LogLevel,
  SurveillanceStatus,
} from "../types/modem";

interface SurveillancePageProps {
  config: ConnectionConfig;
  status: SurveillanceStatus | null;
  onStatusChange: (s: SurveillanceStatus) => void;
  onKillSurveillance: () => Promise<void>;
  onRestoreSurveillance: () => Promise<void>;
  onLog: (level: LogLevel, msg: string) => void;
  onToast: (type: "success" | "error" | "info", msg: string) => void;
}

export function SurveillancePage({
  config,
  status,
  onStatusChange,
  onKillSurveillance,
  onRestoreSurveillance,
  onLog,
  onToast,
}: SurveillancePageProps) {
  const [busyAction, setBusyAction] = useState<
    "scan" | "kill" | "restore" | null
  >(null);

  const handleScan = async () => {
    if (config.state !== "online") {
      onToast("error", "请先连通 Telnet 端口");
      return;
    }
    setBusyAction("scan");
    onLog("info", "正在扫描光猫监控与流控进程...");
    try {
      const s = await invoke<SurveillanceStatus>("check_surveillance", {
        ip: config.ip,
        user: config.user,
        pass: config.pass,
      });
      onStatusChange(s);
      onLog("success", `监控扫描完成：${s.message}`);
      onToast("success", "监控状态扫描完成");
    } catch (err) {
      const e = typeof err === "string" ? err : String(err);
      onLog("error", `扫描失败: ${e}`);
      onToast("error", "扫描监控失败");
    } finally {
      setBusyAction(null);
    }
  };

  const handleAction = async (mode: "kill" | "restore") => {
    if (config.state !== "online") {
      onToast("error", "请先连通 Telnet 端口");
      return;
    }
    setBusyAction(mode);
    try {
      await (mode === "kill" ? onKillSurveillance() : onRestoreSurveillance());
    } finally {
      setBusyAction(null);
    }
  };

  const allClear =
    status !== null &&
    !status.java_running &&
    !status.tr069_running &&
    !status.mirror_driver_loaded;

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#F1F5F9]">
            监控审计与清理
          </h1>
          <p className="mt-1 text-[13px] text-[#94A3B8]">
            检测运营商内置 DPI 深度包检测、Andlink 设备刺探与 TR-069 远程控制模块
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            disabled={busyAction !== null}
            onClick={handleScan}
          >
            {busyAction === "scan" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            重新扫描
          </Button>

          <Button
            variant="success"
            disabled={busyAction !== null}
            onClick={() => void handleAction("restore")}
          >
            {busyAction === "restore" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            恢复 Java 监控
          </Button>

          <Button
            variant="danger"
            disabled={busyAction !== null}
            onClick={() => void handleAction("kill")}
          >
            {busyAction === "kill" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldOff className="h-4 w-4" />
            )}
            停止 Java/DPI 监控
          </Button>
        </div>
      </div>

      {/* 诊断结论横幅 */}
      <Card
        className={
          allClear
            ? "border-[#10B981]/30 bg-[#10B981]/[0.06] p-4"
            : "p-4"
        }
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-[8px] ${
                allClear
                  ? "bg-[#10B981]/15 text-[#10B981]"
                  : "bg-[#14B8A6]/12 text-[#14B8A6]"
              }`}
            >
              {allClear ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <Activity className="h-5 w-5" />
              )}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#F1F5F9]">
                {status ? status.message : "尚未进行审计扫描"}
              </div>
              <div className="text-[12px] text-[#94A3B8]">
                停止 Java OSGi 容器后会锁定自启脚本权限，释放约 50~100MB 内存，不影响正常宽带转发与桥接
              </div>
            </div>
          </div>
          {status && (
            <Badge tone={allClear ? "success" : "warning"}>
              {allClear ? "已全面净化" : "存在活跃模块"}
            </Badge>
          )}
        </div>
      </Card>

      {/* 3 项监控模块明细 */}
      <Card className="p-5">
        <h2 className="mb-4 text-[14px] font-semibold text-[#F1F5F9]">
          核心监控组件检查清单
        </h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
                <Network className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#F1F5F9]">
                  Java OSGi 容器 (cmccdpi / andlink)
                </div>
                <div className="text-[12px] text-[#94A3B8]">
                  负责流量特征分析、DNS 嗅探、家庭设备拓扑采集及 Wi-Fi 信息同步
                </div>
              </div>
            </div>
            {status ? (
              <Badge tone={status.java_running ? "danger" : "success"}>
                {status.java_running
                  ? `运行中 · PID ${status.java_pid ?? "?"}`
                  : "已停止"}
              </Badge>
            ) : (
              <Badge tone="neutral">待检测</Badge>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
                <Radio className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#F1F5F9]">
                  TR-069 / CWMP 远程管理进程 (hgcwmp)
                </div>
                <div className="text-[12px] text-[#94A3B8]">
                  运营商 RMS 平台远程下发参数、重启或修改超级密码的控制通道
                </div>
              </div>
            </div>
            {status ? (
              <Badge tone={status.tr069_running ? "warning" : "success"}>
                {status.tr069_running
                  ? `运行中 · PID ${status.tr069_pid ?? "?"}`
                  : "未运行"}
              </Badge>
            ) : (
              <Badge tone="neutral">待检测</Badge>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#F1F5F9]">
                  内核流量镜像驱动 (hi_kport_mirror)
                </div>
                <div className="text-[12px] text-[#94A3B8]">
                  底层交换芯片流量端口镜像内核模块，用于向 DPI 容器复制数据包
                </div>
              </div>
            </div>
            {status ? (
              <Badge tone={status.mirror_driver_loaded ? "danger" : "success"}>
                {status.mirror_driver_loaded ? "已加载" : "未加载"}
              </Badge>
            ) : (
              <Badge tone="neutral">待检测</Badge>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
