import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  Loader2,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";
import { CredentialRow } from "../components/CredentialRow";
import { Badge, Button, Card, Input, cn } from "../components/ui/primitives";
import type {
  ConnectionConfig,
  EnableTelnetResult,
  LogLevel,
} from "../types/modem";
import {
  evaluatePasswordRules,
  validateTelnetPassword,
} from "../utils/password";

interface SettingsPageProps {
  config: ConnectionConfig;
  onAutoDetect: (targetIp?: string) => Promise<void>;
  onConfigUpdated: (partial: Partial<ConnectionConfig>) => void;
  onLog: (level: LogLevel, msg: string) => void;
  onToast: (type: "success" | "error" | "info", msg: string) => void;
}

export function SettingsPage({
  config,
  onAutoDetect,
  onConfigUpdated,
  onLog,
  onToast,
}: SettingsPageProps) {
  const [manualIp, setManualIp] = useState(config.ip);
  const [manualUser, setManualUser] = useState("");
  const [manualPass, setManualPass] = useState("");
  const [applying, setApplying] = useState(false);

  const trimmedPass = manualPass.trim();
  const rules = evaluatePasswordRules(trimmedPass);

  const handleApplyManual = async () => {
    const targetIp = manualIp.trim() || "192.168.1.1";

    if (trimmedPass) {
      const err = validateTelnetPassword(trimmedPass);
      if (err) {
        onToast("error", err);
        onLog("warn", `密码校验未通过: ${err}`);
        return;
      }
    }

    setApplying(true);
    onLog("info", `[手动模式] 正在向光猫 (${targetIp}) 应用配置并开启 Telnet...`);

    try {
      const res = await invoke<EnableTelnetResult>("enable_telnet", {
        ip: targetIp,
        user: manualUser.trim() || null,
        pass: trimmedPass || null,
      });

      onConfigUpdated({
        ip: targetIp,
        user: res.telnet_user ?? config.user,
        pass: res.telnet_pass ?? config.pass,
        state: res.port_open ? "online" : "offline",
        mode: "manual",
      });

      onLog(
        res.success ? "success" : "warn",
        `${res.message}\n${res.steps.join("\n")}`
      );
      if (res.port_open) {
        onToast("success", "配置已应用，Telnet 23 端口已连通");
      } else {
        onToast("error", "指令已下发，但 23 端口暂未开放");
      }
    } catch (err) {
      const e = typeof err === "string" ? err : String(err);
      onLog("error", `手动开启失败: ${e}`);
      onToast("error", "应用配置失败");
    } finally {
      setApplying(false);
    }
  };

  const handleFillDefault = () => {
    setManualUser("CMCCAdmin");
    setManualPass("aDm8H%MdA");
    onToast("info", "已填入官方默认凭据");
  };

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-[#F1F5F9]">
          连接设置与 Telnet 管理
        </h1>
        <p className="mt-1 text-[13px] text-[#94A3B8]">
          支持免密自动检测开启，也可手动指定网段 IP 与重置 Telnet 登录密码
        </p>
      </div>

      {/* Auto Mode Card */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#14B8A6]/12 text-[#14B8A6]">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-[#F1F5F9]">
                自动模式（开机免密自检）
              </h2>
              <p className="text-[12px] text-[#94A3B8]">
                自动探测光猫管理页面，读取当前 Telnet 凭据并在 23 端口关闭时一键开启
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            disabled={config.state === "checking"}
            onClick={() => onAutoDetect(config.ip)}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                config.state === "checking" && "animate-spin"
              )}
            />
            立即自动检测与开启
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <CredentialRow
            label="当前 IP"
            value={config.ip}
            onCopied={(l) => onToast("info", `已复制${l}`)}
          />
          <CredentialRow
            label="当前账号"
            value={config.user}
            onCopied={(l) => onToast("info", `已复制${l}`)}
          />
          <CredentialRow
            label="当前密码"
            value={config.pass}
            isSecret
            onCopied={(l) => onToast("info", `已复制${l}`)}
          />
        </div>
      </Card>

      {/* Manual Mode Card */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#F59E0B]/12 text-[#F59E0B]">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-[#F1F5F9]">
                手动高级配置
              </h2>
              <p className="text-[12px] text-[#94A3B8]">
                账号与密码均为选填，留空则沿用光猫当前保存的凭据
              </p>
            </div>
          </div>
          <Badge tone="neutral">自定义通道</Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#94A3B8]">
              光猫 IP 地址
            </label>
            <Input
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              placeholder="192.168.1.1"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#94A3B8]">
              Telnet 账号（选填）
            </label>
            <Input
              value={manualUser}
              onChange={(e) => setManualUser(e.target.value)}
              placeholder={`留空默认: ${config.user}`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#94A3B8]">
              Telnet 新密码（选填）
            </label>
            <Input
              value={manualPass}
              onChange={(e) => setManualPass(e.target.value)}
              placeholder="留空保持原密码"
              className="font-mono"
            />
          </div>
        </div>

        {/* 实时密码合规检测条目 */}
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[8px] border border-white/[0.06] bg-[#1A2332]/70 px-3.5 py-2.5 text-[11.5px]">
          <span className="mr-1 font-medium text-[#94A3B8]">
            新密码格式校验：
          </span>
          {[
            { ok: rules.minLength, label: "大于 8 位 (≥9)" },
            { ok: rules.hasLetter, label: "含字母" },
            { ok: rules.hasDigit, label: "含数字" },
            { ok: rules.hasSpecial, label: "含特殊字符" },
            { ok: rules.noSpaces, label: "不含空格" },
          ].map((rule) => (
            <span
              key={rule.label}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors",
                !trimmedPass
                  ? "border-white/[0.08] bg-white/[0.03] text-[#64748B]"
                  : rule.ok
                  ? "border-[#10B981]/30 bg-[#10B981]/12 text-[#34D399]"
                  : "border-[#EF4444]/30 bg-[#EF4444]/12 text-[#F87171]"
              )}
            >
              {trimmedPass ? (
                rule.ok ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )
              ) : null}
              {rule.label}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={handleFillDefault}>
            <RotateCcw className="h-3.5 w-3.5" />
            填入官方默认 (aDm8H%MdA)
          </Button>
          <Button
            variant="primary"
            disabled={applying}
            onClick={handleApplyManual}
          >
            {applying && <Loader2 className="h-4 w-4 animate-spin" />}
            应用配置并开启 Telnet
          </Button>
        </div>
      </Card>
    </div>
  );
}
