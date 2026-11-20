export interface SystemInfo {
  cpu_model: string;
  cpu_cores: number;
  temperature: string;
  uptime: string;
  ram_total_mb: number;
  ram_used_mb: number;
  ram_free_mb: number;
  ram_usage_percent: number;
  pon_status: string;
  wan_mode: string;
  kernel_version: string;
}

export interface Credentials {
  pppoe_username: string | null;
  pppoe_password: string | null;
  gpon_password: string | null;
  base_mac: string | null;
  admin_username: string | null;
  admin_password: string | null;
  user_password: string | null;
  acs_url: string | null;
}

export interface SurveillanceStatus {
  tr069_running: boolean;
  tr069_pid: string | null;
  java_running: boolean;
  java_pid: string | null;
  mirror_driver_loaded: boolean;
  message: string;
}

export interface EnableTelnetResult {
  success: boolean;
  port_open: boolean;
  telnet_user: string | null;
  telnet_pass: string | null;
  steps: string[];
  message: string;
}

export interface AutoDetectResult {
  success: boolean;
  ip: string;
  port_open: boolean;
  telnet_user: string;
  telnet_pass: string;
  telnet_enabled_in_cfg: boolean;
  was_already_running: boolean;
  steps: string[];
  message: string;
}

export type ConnectionState = "checking" | "online" | "offline";

export interface ConnectionConfig {
  ip: string;
  user: string;
  pass: string;
  state: ConnectionState;
  mode: "auto" | "manual";
}

export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  message: string;
}

export interface ToastItem {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}
