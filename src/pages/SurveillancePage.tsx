import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  FolderLock,
  GlobeLock,
  Loader2,
  Network,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Waypoints,
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
  onToggleFtp: (enable: boolean) => Promise<void>;
  onToggleLanIpv6: (enable: boolean) => Promise<void>;
  onLog: (level: LogLevel, msg: string) => void;
  onToast: (type: "success" | "error" | "info", msg: string) => void;
}

export function SurveillancePage({
  config,
  status,
  onStatusChange,
  onKillSurveillance,
  onRestoreSurveillance,
  onToggleFtp,
  onToggleLanIpv6,
  onLog,
  onToast,
}: SurveillancePageProps) {
  const [busyAction, setBusyAction] = useState<
    "scan" | "kill" | "restore" | "ftp" | "ipv6" | null
  >(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);
  const autoScannedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleScan = async (silent = false) => {
    if (config.state !== "online") {
      if (!silent) onToast("error", "请先连通 Telnet 端口");
      return;
    }
    setBusyAction("scan");
    if (!silent) onLog("info", "正在全面审计光猫进程、端口服务与外联状态...");
    try {
      const s = await invoke<SurveillanceStatus>("check_surveillance", {
        ip: config.ip,
        user: config.user,
        pass: config.pass,
      });
      onStatusChange(s);
      onLog("success", `安全审计完成：${s.message}`);
      if (!silent) onToast("success", "安全审计扫描完成");
    } catch (err) {
      const e = typeof err === "string" ? err : String(err);
      onLog("error", `扫描失败: ${e}`);
      if (!silent) onToast("error", "安全审计扫描失败");
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    if (
      config.state === "online" &&
      status === null &&
      !autoScannedRef.current
    ) {
      autoScannedRef.current = true;
      void handleScan(true);
    }
  }, [config.state, status]);

  const runAction = async (
    key: "kill" | "restore" | "ftp" | "ipv6",
    fn: () => Promise<void>
  ) => {
    if (config.state !== "online") {
      onToast("error", "请先连通 Telnet 端口");
      return;
    }
    setBusyAction(key);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestoreClick = () => {
    if (!confirmRestore) {
      setConfirmRestore(true);
      onToast("info", "启动 Java 容器会占用 ~80MB 内存，3 秒内再点一次确认");
      confirmTimerRef.current = window.setTimeout(() => {
        setConfirmRestore(false);
      }, 3500);
      return;
    }
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    setConfirmRestore(false);
    void runAction("restore", onRestoreSurveillance);
  };

  const ipv6Active = Boolean(
    status && (status.ipv6_ra_enabled || status.dhcpv6_enabled)
  );
  const ftpActive = Boolean(
    status && (status.ftp_enabled || status.ftp_running)
  );
  const externalCount = status?.external_connections.length ?? 0;

  const allClear =
    status !== null &&
    !status.java_running &&
    !status.tr069_wan_enabled &&
    !status.mirror_active &&
    !ipv6Active &&
    !ftpActive &&
    externalCount === 0;

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-semibold tracking-tight text-[#F1F5F9]">
              安全审计与加固
            </h1>
            {status && (
              <Badge tone={status.is_root ? "teal" : "neutral"}>
                {status.is_root
                  ? "Root 权限 (uid=0)"
                  : `非 Root 会话 (uid=${status.uid})`}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[12px] text-[#94A3B8]">
            真实核验 Java DPI、TR-069 通道隔离、镜像规则、桥接 IPv6 RA、冗余 FTP 与公网外联
          </p>
        </div>

        <Button
          variant="primary"
          disabled={busyAction !== null || config.state !== "online"}
          onClick={() => void handleScan(false)}
        >
          {busyAction === "scan" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          重新审计
        </Button>
      </div>

      {/* 诊断结论横幅 */}
      <Card
        className={
          allClear
            ? "relative overflow-hidden border-[#10B981]/30 bg-[#10B981]/[0.06] p-4"
            : "relative overflow-hidden p-4"
        }
      >
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r ${
            allClear
              ? "from-[#10B981]/60 via-[#10B981]/20"
              : "from-[#14B8A6]/60 via-[#14B8A6]/20"
          } to-transparent`}
        />
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${
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
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#F1F5F9]">
                {status ? status.message : "正在准备审计，或点击右上角“重新审计”"}
              </div>
              <div className="mt-0.5 text-[12px] text-[#94A3B8]">
                {status && !status.is_root
                  ? "当前 Telnet 为受限账号：停止 Java 仅在本次开机生效；LAN IPv6 与 FTP 开关写入原生配置，重启永久生效。"
                  : "停止 Java 容器可释放 60~100MB 内存；关闭桥接 LAN IPv6 RA 与冗余 FTP 可杜绝假网关卡顿并缩小暴露面。"}
              </div>
            </div>
          </div>
          {status && (
            <Badge
              tone={allClear ? "success" : "warning"}
              className="shrink-0"
            >
              {allClear ? "安全达标" : "待加固"}
            </Badge>
          )}
        </div>
      </Card>

      {/* 6 项严格右对齐的安全审计清单 */}
      <Card className="p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-[#F1F5F9]">
          底层服务与网络面实测清单
        </h2>

        <div className="space-y-2.5">
          {/* 1. Java OSGi */}
          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-4 py-3.5 transition-colors hover:border-white/[0.11]">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
                <Network className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#F1F5F9]">
                  Java OSGi 容器 (cmccdpi / andlink)
                </div>
                <div className="mt-0.5 text-[12px] text-[#94A3B8]">
                  运营商插件容器，用于 DPI 特征探测与拓扑上报（停用可释放 60~100MB 内存）
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              {status ? (
                <>
                  <Badge tone={status.java_running ? "danger" : "success"}>
                    {status.java_running
                      ? `运行中 · PID ${status.java_pid ?? "?"}`
                      : "已停止"}
                  </Badge>
                  {status.java_running ? (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => void runAction("kill", onKillSurveillance)}
                    >
                      {busyAction === "kill" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldOff className="h-3.5 w-3.5" />
                      )}
                      停止释放
                    </Button>
                  ) : (
                    <Button
                      variant={confirmRestore ? "danger" : "secondary"}
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={handleRestoreClick}
                      title="启动后将占用约 80MB 内存，仅在需要运营商插件时开启"
                    >
                      {busyAction === "restore" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      {confirmRestore ? "确认启动？" : "启动容器"}
                    </Button>
                  )}
                </>
              ) : (
                <Badge tone="neutral">待检测</Badge>
              )}
            </div>
          </div>

          {/* 2. LAN IPv6 RA / DHCPv6 */}
          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-4 py-3.5 transition-colors hover:border-white/[0.11]">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
                <Waypoints className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#F1F5F9]">
                  LAN 侧 IPv6 路由通告与 DHCPv6（防桥接卡死）
                </div>
                <div className="mt-0.5 text-[12px] text-[#94A3B8]">
                  桥接模式下开启 RA 会向局域网广播假网关 fe80::1，导致游戏断流 20~30 秒
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              {status ? (
                <>
                  <Badge tone={ipv6Active ? "danger" : "success"}>
                    {ipv6Active ? "广播已开启" : "已关闭 · 安全"}
                  </Badge>
                  <Button
                    variant={ipv6Active ? "danger" : "secondary"}
                    size="sm"
                    disabled={busyAction !== null}
                    onClick={() =>
                      void runAction("ipv6", () => onToggleLanIpv6(!ipv6Active))
                    }
                  >
                    {busyAction === "ipv6" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {ipv6Active ? "一键关闭" : "恢复开启"}
                  </Button>
                </>
              ) : (
                <Badge tone="neutral">待检测</Badge>
              )}
            </div>
          </div>

          {/* 3. Built-in FTP (vsftpd) */}
          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-4 py-3.5 transition-colors hover:border-white/[0.11]">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
                <FolderLock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#F1F5F9]">
                  光猫内置 FTP 服务 (vsftpd · 21 端口)
                </div>
                <div className="mt-0.5 text-[12px] text-[#94A3B8]">
                  出厂默认常开且使用弱默认凭据，无 USB 共享需求建议永久关闭
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              {status ? (
                <>
                  <Badge tone={ftpActive ? "warning" : "success"}>
                    {ftpActive ? "21 端口开放中" : "已关闭"}
                  </Badge>
                  <Button
                    variant={ftpActive ? "danger" : "secondary"}
                    size="sm"
                    disabled={busyAction !== null}
                    onClick={() =>
                      void runAction("ftp", () => onToggleFtp(!ftpActive))
                    }
                  >
                    {busyAction === "ftp" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {ftpActive ? "关闭 FTP" : "开启 FTP"}
                  </Button>
                </>
              ) : (
                <Badge tone="neutral">待检测</Badge>
              )}
            </div>
          </div>

          {/* 4. TR-069 / CWMP */}
          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-4 py-3.5 transition-colors hover:border-white/[0.11]">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
                <Radio className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#F1F5F9]">
                  TR-069 / CWMP 远程管理通道 (hgcwmp)
                </div>
                <div className="mt-0.5 text-[12px] text-[#94A3B8]">
                  仅当 TR-069 WAN 通道启用时运营商 RMS 才具备外网远程下发能力
                </div>
              </div>
            </div>
            <div className="shrink-0">
              {status ? (
                <Badge tone={status.tr069_wan_enabled ? "warning" : "success"}>
                  {status.tr069_wan_enabled
                    ? `通道启用 (${status.tr069_wan_status})`
                    : status.tr069_running
                    ? `通道已禁用 · 待机 (PID ${status.tr069_pid ?? "?"})`
                    : "已禁用"}
                </Badge>
              ) : (
                <Badge tone="neutral">待检测</Badge>
              )}
            </div>
          </div>

          {/* 5. Port Mirror */}
          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-4 py-3.5 transition-colors hover:border-white/[0.11]">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
                <Activity className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#F1F5F9]">
                  交换芯片端口镜像 (/mirrorCfg · hi_kport_mirror)
                </div>
                <div className="mt-0.5 text-[12px] text-[#94A3B8]">
                  实测查询 /mirrorCfg 运行规则（驱动常驻但无规则时零流量复制）
                </div>
              </div>
            </div>
            <div className="shrink-0">
              {status ? (
                <Badge tone={status.mirror_active ? "danger" : "success"}>
                  {status.mirror_active
                    ? "活跃抓包中"
                    : status.mirror_driver_loaded
                    ? "无镜像规则 · 待机"
                    : "未加载"}
                </Badge>
              ) : (
                <Badge tone="neutral">待检测</Badge>
              )}
            </div>
          </div>

          {/* 6. Outbound External Connections */}
          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/85 px-4 py-3.5 transition-colors hover:border-white/[0.11]">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06] text-[#94A3B8]">
                <GlobeLock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#F1F5F9]">
                  公网 / 运营商外联 TCP 连接监测 (netstat)
                </div>
                <div className="mt-0.5 truncate text-[12px] text-[#94A3B8]">
                  {externalCount > 0 && status
                    ? status.external_connections.join(" | ")
                    : "自动过滤局域网管理会话，实时核验是否存在公网数据上报连接"}
                </div>
              </div>
            </div>
            <div className="shrink-0">
              {status ? (
                <Badge tone={externalCount > 0 ? "danger" : "success"}>
                  {externalCount > 0
                    ? `发现 ${externalCount} 条外联`
                    : "0 条外联 · 洁净"}
                </Badge>
              ) : (
                <Badge tone="neutral">待检测</Badge>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
