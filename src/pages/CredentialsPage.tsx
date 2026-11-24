import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  ClipboardCopy,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { CredentialRow } from "../components/CredentialRow";
import { Badge, Button, Card } from "../components/ui/primitives";
import type { ConnectionConfig, Credentials, LogLevel } from "../types/modem";

interface CredentialsPageProps {
  config: ConnectionConfig;
  credentials: Credentials | null;
  lastUpdated: string | null;
  onCredentialsLoaded: (creds: Credentials, updatedAt: string) => void;
  onLog: (level: LogLevel, msg: string) => void;
  onToast: (type: "success" | "error" | "info", msg: string) => void;
}

export function CredentialsPage({
  config,
  credentials,
  lastUpdated,
  onCredentialsLoaded,
  onLog,
  onToast,
}: CredentialsPageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [revealAll, setRevealAll] = useState(false);

  const handleExtract = async () => {
    if (config.state !== "online") {
      const msg = "Telnet 23 端口尚未就绪，请先点击顶部“重连”或开启 Telnet";
      setError(msg);
      onLog("warn", msg);
      onToast("error", "Telnet 未连通");
      return;
    }

    setLoading(true);
    setError(null);
    onLog("info", `正在通过 Telnet (${config.ip}) 读取光猫底层凭据...`);

    try {
      const res = await invoke<Credentials>("get_credentials", {
        ip: config.ip,
        user: config.user,
        pass: config.pass,
      });
      const ts = new Date().toLocaleTimeString();
      onCredentialsLoaded(res, ts);
      onLog(
        "success",
        "核心凭据提取成功（宽带账号、超管密码、GPON认证码与 SN 已更新）"
      );
      onToast("success", "核心凭据提取完成");
    } catch (err) {
      const errMsg = typeof err === "string" ? err : String(err);
      setError(errMsg);
      onLog("error", `提取凭据失败: ${errMsg}`);
      onToast("error", "提取凭据失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCopySummary = async () => {
    if (!credentials) return;
    const summary = [
      `[ModemBox 核心凭据备份 - ${config.ip}]`,
      `宽带账号 (PPPoE): ${credentials.pppoe_username ?? "未读取"}`,
      `宽带密码 (PPPoE): ${credentials.pppoe_password ?? "未读取"}`,
      `超管账号: ${credentials.admin_username ?? "CMCCAdmin"}`,
      `超管密码: ${credentials.admin_password ?? "未读取"}`,
      `普通密码: ${credentials.user_password ?? "未读取"}`,
      `GPON 认证密码: ${credentials.gpon_password ?? "未读取"}`,
      `设备 SN 码: ${credentials.serial_number ?? "未读取"}`,
      `Base MAC: ${credentials.base_mac ?? "未读取"}`,
      `ACS 管理地址: ${credentials.acs_url ?? "无"}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      setCopiedAll(true);
      onLog("success", "已将全部核心凭据摘要复制到剪贴板");
      onToast("success", "已复制全部凭据备份");
      setTimeout(() => setCopiedAll(false), 1800);
    } catch {
      onToast("error", "复制到剪贴板失败");
    }
  };

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-semibold tracking-tight text-[#F1F5F9]">
              核心凭据库
            </h1>
            {lastUpdated ? (
              <Badge tone="success" className="font-mono tabular-nums">
                已同步 · {lastUpdated}
              </Badge>
            ) : (
              <Badge tone="neutral">等待提取</Badge>
            )}
          </div>
          <p className="mt-1 text-[12px] text-[#94A3B8]">
            直接解析光猫底层配置，安全读取宽带拨号、超级管理员与光纤注册认证密码
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!credentials}
            onClick={() => setRevealAll((v) => !v)}
          >
            {revealAll ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {revealAll ? "隐藏明文" : "显示全部"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={!credentials || loading}
            onClick={handleCopySummary}
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copiedAll ? "已复制摘要" : "导出备份"}
          </Button>

          <Button
            variant="primary"
            disabled={loading || config.state !== "online"}
            onClick={handleExtract}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在提取...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                提取全部凭据
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-[10px] border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-[12px] text-[#FCA5A5]">
          <AlertCircle className="h-4 w-4 shrink-0 text-[#EF4444]" />
          <span>{error}</span>
        </div>
      )}

      {!credentials && !error && config.state === "online" && (
        <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#14B8A6]/25 bg-[#14B8A6]/[0.07] px-4 py-3 text-[12px] text-[#CBD5E1]">
          <span>
            凭据默认按需读取、不落盘保存。点击右侧按钮即可从 <span className="font-mono text-[#2DD4BF]">{config.ip}</span> 安全提取全部账号与光路注册码。
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={handleExtract}
          >
            立即读取
          </Button>
        </div>
      )}

      {/* Card 1: 宽带拨号凭据 */}
      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-[#14B8A6]/60 via-[#14B8A6]/20 to-transparent" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#14B8A6]/12 text-[#14B8A6]">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#F1F5F9]">
                宽带拨号凭据 (PPPoE)
              </h2>
              <p className="text-[12px] text-[#94A3B8]">
                用于光猫改桥接后，在主路由器（OpenWrt / 锐捷等）发起拨号上网
              </p>
            </div>
          </div>
          <Badge tone="teal">路由器拨号必备</Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <CredentialRow
            label="宽带账号"
            value={credentials?.pppoe_username}
            onCopied={(l) => {
              onLog("info", `已复制${l}`);
              onToast("info", `已复制${l}`);
            }}
          />
          <CredentialRow
            label="宽带密码"
            value={credentials?.pppoe_password}
            isSecret
            forceRevealed={revealAll}
            onCopied={(l) => {
              onLog("info", `已复制${l}`);
              onToast("info", `已复制${l}`);
            }}
          />
        </div>
      </Card>

      {/* Card 2 & 3: 1080px 下全宽展示确保长 URL 与密码零截断，超宽屏 (>=1280px) 自动双列 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#F59E0B]/12 text-[#F59E0B]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#F1F5F9]">
                Web 后台管理权限
              </h2>
              <p className="text-[12px] text-[#94A3B8]">
                登录 {config.ip} 网页后台配置桥接与端口绑定
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <CredentialRow
              label="超管账号"
              value={credentials?.admin_username}
              badgeText="最高权限"
              badgeTone="warning"
              onCopied={(l) => {
                onLog("info", `已复制${l}`);
                onToast("info", `已复制${l}`);
              }}
            />
            <CredentialRow
              label="超管密码"
              value={credentials?.admin_password}
              isSecret
              forceRevealed={revealAll}
              onCopied={(l) => {
                onLog("info", `已复制${l}`);
                onToast("info", `已复制${l}`);
              }}
            />
            <CredentialRow
              label="普通用户密码"
              value={credentials?.user_password}
              isSecret
              forceRevealed={revealAll}
              badgeText="user"
              onCopied={(l) => {
                onLog("info", `已复制${l}`);
                onToast("info", `已复制${l}`);
              }}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#10B981]/12 text-[#10B981]">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#F1F5F9]">
                光纤认证与设备标识
              </h2>
              <p className="text-[12px] text-[#94A3B8]">
                更换自购光猫 / 猫棒时用于向局端 OLT 完成注册认证
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <CredentialRow
              label="GPON 认证密码"
              value={credentials?.gpon_password}
              isSecret
              forceRevealed={revealAll}
              badgeText="注册凭据"
              badgeTone="success"
              onCopied={(l) => {
                onLog("info", `已复制${l}`);
                onToast("info", `已复制${l}`);
              }}
            />
            <CredentialRow
              label="设备 SN 码"
              value={credentials?.serial_number}
              onCopied={(l) => {
                onLog("info", `已复制${l}`);
                onToast("info", `已复制${l}`);
              }}
            />
            <CredentialRow
              label="设备基准 MAC"
              value={credentials?.base_mac}
              onCopied={(l) => {
                onLog("info", `已复制${l}`);
                onToast("info", `已复制${l}`);
              }}
            />
            <CredentialRow
              label="TR-069 ACS 地址"
              value={credentials?.acs_url}
              emptyPlaceholder="无 / 未配置"
              onCopied={(l) => {
                onLog("info", `已复制${l}`);
                onToast("info", `已复制${l}`);
              }}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
