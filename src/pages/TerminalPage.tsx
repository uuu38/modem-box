import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Loader2, Play, Trash2 } from "lucide-react";
import { Button, Card, Input } from "../components/ui/primitives";
import type { ConnectionConfig, LogLevel } from "../types/modem";

interface TerminalPageProps {
  config: ConnectionConfig;
  onLog: (level: LogLevel, msg: string) => void;
  onToast: (type: "success" | "error" | "info", msg: string) => void;
}

const PRESET_COMMANDS = [
  { label: "free -m (内存)", cmd: "free -m" },
  { label: "ps 监控进程", cmd: "ps | grep -iE 'java|tr069|cwmp'" },
  { label: "cat /proc/mtd (分区)", cmd: "cat /proc/mtd" },
  { label: "brctl show (网桥)", cmd: "brctl show" },
  { label: "df -h (存储空间)", cmd: "df -h" },
  { label: "uname -a (内核)", cmd: "uname -a" },
];

export function TerminalPage({
  config,
  onLog,
  onToast,
}: TerminalPageProps) {
  const [cmdInput, setCmdInput] = useState("");
  const [output, setOutput] = useState("// 选择上方快捷指令，或输入 Shell 命令后按回车执行...");
  const [running, setRunning] = useState(false);

  const runCmd = async (targetCmd: string) => {
    const trimmed = targetCmd.trim();
    if (!trimmed) return;
    if (config.state !== "online") {
      onToast("error", "Telnet 23 端口未连通");
      return;
    }

    setRunning(true);
    setOutput(`$ ${trimmed}\n⏳ 正在光猫终端执行...`);

    try {
      const res = await invoke<string>("exec_shell_cmd", {
        ip: config.ip,
        user: config.user,
        pass: config.pass,
        cmd: trimmed,
      });
      setOutput(`$ ${trimmed}\n${res || "(命令执行完成，无标准输出)"}`);
      onLog("info", `终端执行: ${trimmed}`);
    } catch (err) {
      const e = typeof err === "string" ? err : String(err);
      setOutput(`$ ${trimmed}\n❌ ERROR: ${e}`);
      onLog("error", `终端执行失败: ${e}`);
      onToast("error", "命令执行失败");
    } finally {
      setRunning(false);
    }
  };

  const handleCopyOutput = async () => {
    await navigator.clipboard.writeText(output);
    onToast("info", "已复制终端输出");
  };

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#F1F5F9]">
            快捷终端
          </h1>
          <p className="mt-1 text-[13px] text-[#94A3B8]">
            直接向光猫 Linux Shell 发送诊断或配置命令（当前目标：{config.ip}）
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleCopyOutput}>
            <Copy className="h-3.5 w-3.5" />
            复制结果
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOutput("// 终端输出已清空")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            清屏
          </Button>
        </div>
      </div>

      {/* Quick Presets + Terminal Box */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {PRESET_COMMANDS.map((item) => (
            <button
              key={item.cmd}
              type="button"
              disabled={running}
              onClick={() => {
                setCmdInput(item.cmd);
                runCmd(item.cmd);
              }}
              className="rounded-full border border-white/[0.08] bg-[#1A2332] px-3 py-1 font-mono text-[11.5px] text-[#2DD4BF] transition-colors hover:border-[#14B8A6]/40 hover:bg-[#14B8A6]/12 disabled:opacity-50 cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2.5">
          <Input
            type="text"
            value={cmdInput}
            onChange={(e) => setCmdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !running) runCmd(cmdInput);
            }}
            placeholder="输入任意 Shell 命令，例如: ifconfig 或 cat /proc/meminfo"
            className="font-mono"
          />
          <Button
            variant="primary"
            disabled={running || !cmdInput.trim()}
            onClick={() => runCmd(cmdInput)}
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            执行
          </Button>
        </div>

        <pre className="h-[340px] select-text overflow-y-auto whitespace-pre-wrap break-all rounded-[8px] border border-white/[0.08] bg-[#070A12] p-4 font-mono text-[12px] leading-relaxed text-[#CBD5E1]">
          {output}
        </pre>
      </Card>
    </div>
  );
}
