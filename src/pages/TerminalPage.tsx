import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Loader2, Play, Trash2 } from "lucide-react";
import { Button, Card, Input, Kbd } from "../components/ui/primitives";
import type { ConnectionConfig, LogLevel } from "../types/modem";

interface TerminalPageProps {
  config: ConnectionConfig;
  onLog: (level: LogLevel, msg: string) => void;
  onToast: (type: "success" | "error" | "info", msg: string) => void;
}

const PRESET_COMMANDS = [
  { label: "free -m (内存)", cmd: "free -m" },
  { label: "top 快照 (CPU)", cmd: "top -bn1 | head -n 15" },
  { label: "ps 核心进程", cmd: "ps | grep -iE 'java|tr069|cwmp|vsftpd|dnsmasq'" },
  { label: "netstat (连接)", cmd: "netstat -nt" },
  { label: "brctl show (网桥)", cmd: "brctl show" },
  { label: "dnsmasq 配置", cmd: "cat /tmp/etc/dnsmasq.conf" },
  { label: "系统日志 (20行)", cmd: "tail -n 20 /var/log/messages" },
  { label: "内核日志 (25行)", cmd: "dmesg | tail -n 25" },
];

const INITIAL_BANNER =
  "// 选择上方快捷指令，或输入 Shell 命令后按回车执行（支持 ↑ / ↓ 翻阅历史，⌘K 清屏）...";

export function TerminalPage({
  config,
  onLog,
  onToast,
}: TerminalPageProps) {
  const [cmdInput, setCmdInput] = useState("");
  const [output, setOutput] = useState(INITIAL_BANNER);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const outputRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOutput("// 终端输出已清空");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runCmd = async (targetCmd: string) => {
    const trimmed = targetCmd.trim();
    if (!trimmed) return;
    if (config.state !== "online") {
      onToast("error", "Telnet 23 端口未连通");
      return;
    }

    setHistory((prev) =>
      prev[0] === trimmed ? prev : [trimmed, ...prev.slice(0, 49)]
    );
    setHistoryIdx(-1);

    setRunning(true);
    const ts = new Date().toLocaleTimeString();
    setOutput((prev) => {
      const base =
        prev === INITIAL_BANNER || prev === "// 终端输出已清空"
          ? ""
          : `${prev}\n\n`;
      return `${base}[${ts}] $ ${trimmed}\n⏳ 正在光猫终端执行...`;
    });

    try {
      const res = await invoke<string>("exec_shell_cmd", {
        ip: config.ip,
        user: config.user,
        pass: config.pass,
        cmd: trimmed,
      });
      setOutput((prev) =>
        prev.replace(
          "⏳ 正在光猫终端执行...",
          res || "(命令执行完成，无标准输出)"
        )
      );
      onLog("info", `终端执行: ${trimmed}`);
    } catch (err) {
      const e = typeof err === "string" ? err : String(err);
      setOutput((prev) =>
        prev.replace("⏳ 正在光猫终端执行...", `❌ ERROR: ${e}`)
      );
      onLog("error", `终端执行失败: ${e}`);
      onToast("error", "命令执行失败");
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !running) {
      void runCmd(cmdInput);
      return;
    }
    if (e.key === "ArrowUp") {
      if (history.length === 0) return;
      e.preventDefault();
      const nextIdx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(nextIdx);
      setCmdInput(history[nextIdx]);
      return;
    }
    if (e.key === "ArrowDown") {
      if (historyIdx < 0) return;
      e.preventDefault();
      const nextIdx = historyIdx - 1;
      setHistoryIdx(nextIdx);
      setCmdInput(nextIdx < 0 ? "" : history[nextIdx]);
    }
  };

  const handleCopyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      onToast("info", "已复制终端输出");
    } catch {
      onToast("error", "复制到剪贴板失败");
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-[1040px] flex-col gap-4">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#F1F5F9]">
            快捷终端
          </h1>
          <p className="mt-1 text-[12px] text-[#94A3B8]">
            直接向光猫 Linux Shell 发送诊断命令（目标：<span className="font-mono">{config.ip}</span> · 支持 ↑/↓ 历史与完整回显）
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
            title="清空屏幕 (⌘K)"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清屏
            <Kbd>⌘K</Kbd>
          </Button>
        </div>
      </div>

      {/* Viewport-filling Terminal Card */}
      <Card className="relative flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-[#14B8A6]/60 via-[#14B8A6]/20 to-transparent" />

        <div className="flex shrink-0 flex-wrap gap-2">
          {PRESET_COMMANDS.map((item) => (
            <button
              key={item.cmd}
              type="button"
              disabled={running}
              onClick={() => {
                setCmdInput(item.cmd);
                void runCmd(item.cmd);
              }}
              className="rounded-full border border-white/[0.08] bg-[#1A2332] px-3 py-1 font-mono text-[11.5px] text-[#2DD4BF] transition-colors hover:border-[#14B8A6]/40 hover:bg-[#14B8A6]/12 disabled:opacity-45 cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 gap-2.5">
          <Input
            type="text"
            value={cmdInput}
            onChange={(e) => {
              setCmdInput(e.target.value);
              setHistoryIdx(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入任意 Shell 命令，例如: ifconfig 或 cat /proc/meminfo（↑/↓ 翻阅历史）"
            className="font-mono"
          />
          <Button
            variant="primary"
            disabled={running || !cmdInput.trim()}
            onClick={() => void runCmd(cmdInput)}
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            执行
          </Button>
        </div>

        <pre
          ref={outputRef}
          className="min-h-[220px] flex-1 select-text overflow-y-auto whitespace-pre-wrap break-all rounded-[8px] border border-white/[0.08] bg-[#070A12] p-4 font-mono text-[12px] leading-relaxed text-[#CBD5E1]"
        >
          {output}
        </pre>
      </Card>
    </div>
  );
}
