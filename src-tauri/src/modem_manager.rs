use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::time::{Duration, sleep};

use crate::telnet_client::TelnetClient;
use crate::web_client::WebClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub model_name: Option<String>,
    pub serial_number: Option<String>,
    pub software_version: Option<String>,
    pub soc_chip: Option<String>,
    pub cpu_model: String,
    pub cpu_cores: usize,
    pub cpu_load_1m: f64,
    pub cpu_usage_percent: f64,
    pub temperature: String,
    pub temperature_c: Option<f64>,
    pub optical_temp_c: Option<f64>,
    pub rx_power_dbm: Option<f64>,
    pub tx_power_dbm: Option<f64>,
    pub uptime: String,
    pub ram_total_mb: u64,
    pub ram_used_mb: u64,
    pub ram_free_mb: u64,
    pub ram_usage_percent: u64,
    pub pon_status: String,
    pub wan_mode: String,
    pub kernel_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub pppoe_username: Option<String>,
    pub pppoe_password: Option<String>,
    pub gpon_password: Option<String>,
    pub serial_number: Option<String>,
    pub base_mac: Option<String>,
    pub admin_username: Option<String>,
    pub admin_password: Option<String>,
    pub user_password: Option<String>,
    pub acs_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveillanceStatus {
    pub is_root: bool,
    pub uid: String,
    pub tr069_running: bool,
    pub tr069_pid: Option<String>,
    pub tr069_wan_enabled: bool,
    pub tr069_wan_status: String,
    pub java_running: bool,
    pub java_pid: Option<String>,
    pub mirror_driver_loaded: bool,
    pub mirror_active: bool,
    pub ftp_running: bool,
    pub ftp_enabled: bool,
    pub ipv6_ra_enabled: bool,
    pub dhcpv6_enabled: bool,
    pub external_connections: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct CpuStatSample {
    total: u64,
    idle: u64,
}

pub struct ModemManager;

impl ModemManager {
    /// Retrieve and parse real-time system hardware, CPU (/proc/stat delta), RAM, thermal & optical telemetry
    pub async fn get_system_info(
        client: &mut TelnetClient,
        web: &WebClient,
    ) -> Result<SystemInfo, String> {
        // Run HTTP device/optical telemetry concurrently with static/proc Telnet reads first
        // so that hghttpd and brctl forks do not inflate the /proc/stat CPU measurement window.
        let telnet_info_future = async {
            let cpu_info = client.exec("cat /proc/cpuinfo").await?;
            let temp_raw = client
                .exec("cat /sys/class/thermal/thermal_zone0/temp 2>/tmp/.null || cat /sys/class/thermal/thermal_zone*/temp 2>/tmp/.null | head -n 1")
                .await
                .unwrap_or_default();
            let load_raw = client
                .exec("cat /proc/loadavg 2>/tmp/.null")
                .await
                .unwrap_or_default();
            let uptime_raw = client.exec("cat /proc/uptime").await.unwrap_or_default();
            let mem_info = client.exec("cat /proc/meminfo").await?;
            let pon_raw = client
                .exec("cat /tmp/cmcc_pon_state 2>/tmp/.null")
                .await
                .unwrap_or_default();
            let kernel = client
                .exec("uname -r")
                .await
                .unwrap_or_else(|_| "5.10.0".to_string());
            let brctl_raw = client.exec("brctl show").await.unwrap_or_default();

            Ok::<_, String>((
                cpu_info, temp_raw, load_raw, uptime_raw, mem_info, pon_raw, kernel, brctl_raw,
            ))
        };

        let (telnet_res, telemetry) = tokio::join!(telnet_info_future, web.get_device_telemetry());
        let (cpu_info, temp_raw, load_raw, uptime_raw, mem_info, pon_raw, kernel, brctl_raw) =
            telnet_res?;

        // Quiet 450ms /proc/stat delta window for clean real-time CPU usage %
        let stat0_raw = client
            .exec("head -n 1 /proc/stat 2>/tmp/.null")
            .await
            .unwrap_or_default();
        sleep(Duration::from_millis(450)).await;
        let stat1_raw = client
            .exec("head -n 1 /proc/stat 2>/tmp/.null")
            .await
            .unwrap_or_default();

        // Parse CPU model with ARMv7 /proc/cpuinfo fallbacks
        let cpu_model = ["model name", "Processor", "Hardware"]
            .iter()
            .find_map(|key| {
                cpu_info
                    .lines()
                    .find(|l| l.trim_start().starts_with(key))
                    .and_then(|l| l.split(':').nth(1))
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
            })
            .unwrap_or_else(|| "ARMv7 Processor".to_string());

        let cpu_cores = cpu_info
            .lines()
            .filter(|l| l.starts_with("processor"))
            .count()
            .max(1);

        let cpu_load_1m: f64 = load_raw
            .split_whitespace()
            .next()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);

        // Compute real-time CPU usage % from /proc/stat delta (avoids D-state loadavg inflation)
        let cpu_usage_percent = match (
            parse_proc_stat_cpu(&stat0_raw),
            parse_proc_stat_cpu(&stat1_raw),
        ) {
            (Some(s0), Some(s1)) => calc_cpu_usage_percent(s0, s1),
            _ => ((cpu_load_1m / cpu_cores as f64) * 100.0).clamp(0.0, 100.0),
        };

        // Parse SoC Temperature (handle millidegrees e.g. 58000 -> 58.0°C)
        let temperature_c = temp_raw
            .split_whitespace()
            .next()
            .and_then(|s| s.parse::<f64>().ok())
            .map(|v| if v >= 1000.0 { v / 1000.0 } else { v })
            .map(|c| (c * 10.0).round() / 10.0)
            .filter(|&c| c > 0.0 && c < 150.0);

        let temperature = match temperature_c {
            Some(c) => {
                if (c.fract()).abs() < 0.05 {
                    format!("{:.0}°C", c)
                } else {
                    format!("{:.1}°C", c)
                }
            }
            None => "--".to_string(),
        };

        // Parse Uptime
        let up_secs: u64 = uptime_raw
            .split_whitespace()
            .next()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0) as u64;
        let uptime = format_uptime(up_secs);

        // Parse RAM
        let mut tot_kb = 0u64;
        let mut free_kb = 0u64;
        let mut avail_kb = 0u64;
        let mut buffers_kb = 0u64;
        let mut cached_kb = 0u64;

        for line in mem_info.lines() {
            if line.starts_with("MemTotal:") {
                tot_kb = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            } else if line.starts_with("MemFree:") {
                free_kb = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            } else if line.starts_with("MemAvailable:") {
                avail_kb = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            } else if line.starts_with("Buffers:") {
                buffers_kb = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            } else if line.starts_with("Cached:") {
                cached_kb = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            }
        }
        if avail_kb == 0 {
            avail_kb = free_kb + buffers_kb + cached_kb;
        }

        let ram_total_mb = tot_kb / 1024;
        let ram_free_mb = avail_kb / 1024;
        let ram_used_mb = ram_total_mb.saturating_sub(ram_free_mb);
        let ram_usage_percent = if ram_total_mb > 0 {
            ((ram_used_mb as f64 / ram_total_mb as f64) * 100.0)
                .round()
                .clamp(0.0, 100.0) as u64
        } else {
            0
        };

        // Parse PON status (prefer live GPON interface Status, fallback to /tmp/cmcc_pon_state)
        let pon_status = match telemetry.pon_link_status.as_deref() {
            Some(s) if s.eq_ignore_ascii_case("Up") => "已注册上线 (Up)".to_string(),
            Some(s) if !s.is_empty() => format!("光路状态 ({})", s),
            _ if pon_raw.trim() == "1" => "已注册上线".to_string(),
            _ => "未就绪 / 同步中".to_string(),
        };

        // Parse WAN Mode
        let wan_mode = if brctl_raw.contains("wan_") {
            "桥接模式 (Bridge)".to_string()
        } else {
            "路由模式 (Route)".to_string()
        };

        Ok(SystemInfo {
            model_name: telemetry.model_name,
            serial_number: telemetry.serial_number,
            software_version: telemetry.software_version,
            soc_chip: telemetry.soc_chip,
            cpu_model,
            cpu_cores,
            cpu_load_1m,
            cpu_usage_percent,
            temperature,
            temperature_c,
            optical_temp_c: telemetry.optical_temp_c,
            rx_power_dbm: telemetry.rx_power_dbm,
            tx_power_dbm: telemetry.tx_power_dbm,
            uptime,
            ram_total_mb,
            ram_used_mb,
            ram_free_mb,
            ram_usage_percent,
            pon_status,
            wan_mode,
            kernel_version: kernel.trim().to_string(),
        })
    }

    /// Extract sensitive authentication & line credentials from lastgood.xml + DeviceInfo
    pub async fn get_credentials(
        client: &mut TelnetClient,
        web: &WebClient,
    ) -> Result<Credentials, String> {
        let telnet_future = async {
            let xml_snippet = client
                .exec("grep -E '(aucPassword|aucUsername|aucPasswd|aucTeleAccountPassword|aucAcsUrl|BaseMacAddr|aucUserAccountPassword)' /config/work/lastgood.xml")
                .await?;
            let mac_raw = client
                .exec("hbus .Profile.BaseMacAddr 2>/tmp/.null")
                .await
                .unwrap_or_default();
            Ok::<_, String>((xml_snippet, mac_raw))
        };

        let (telnet_res, telemetry) = tokio::join!(telnet_future, web.get_device_telemetry());
        let (xml_snippet, mac_raw) = telnet_res?;

        let mut creds = Credentials {
            pppoe_username: None,
            pppoe_password: None,
            gpon_password: None,
            serial_number: telemetry.serial_number,
            base_mac: None,
            admin_username: Some("CMCCAdmin".to_string()),
            admin_password: None,
            user_password: None,
            acs_url: None,
        };

        let re_mac = Regex::new(r"([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})").unwrap();
        if let Some(m) = re_mac.find(&mac_raw) {
            creds.base_mac = Some(m.as_str().to_string());
        }

        let re_val = Regex::new(r#"Value="([^"]*)""#).unwrap();
        let extract_val =
            |line: &str| -> Option<String> { re_val.captures(line).map(|cap| cap[1].to_string()) };

        for line in xml_snippet.lines() {
            if line.contains("aucTeleAccountPassword") {
                if let Some(val) = extract_val(line) {
                    creds.admin_password = Some(val);
                }
            } else if line.contains("aucUserAccountPassword") {
                if let Some(val) = extract_val(line) {
                    creds.user_password = Some(val);
                }
            } else if line.contains("aucPasswd") && !line.contains("aucKeyPassphrase") {
                if let Some(val) = extract_val(line)
                    && !val.is_empty()
                    && creds.gpon_password.is_none()
                {
                    creds.gpon_password = Some(val);
                }
            } else if line.contains("aucAcsUrl") {
                if let Some(val) = extract_val(line)
                    && val.starts_with("http")
                    && creds.acs_url.is_none()
                {
                    creds.acs_url = Some(val);
                }
            } else if line.contains("aucUsername") {
                if let Some(val) = extract_val(line)
                    && val.len() >= 6
                    && val.chars().all(|c| c.is_ascii_digit())
                    && creds.pppoe_username.is_none()
                {
                    creds.pppoe_username = Some(val);
                }
            } else if line.contains("aucPassword")
                && let Some(val) = extract_val(line)
                && val.len() >= 6
                && creds.pppoe_password.is_none()
                && creds.admin_password.as_deref() != Some(&val)
            {
                creds.pppoe_password = Some(val);
            }
        }

        Ok(creds)
    }

    /// Deep security & surveillance audit (processes + HTTP config + port mirror + outbound connections)
    pub async fn check_surveillance(
        client: &mut TelnetClient,
        web: &WebClient,
    ) -> Result<SurveillanceStatus, String> {
        let telnet_future = async {
            let uid_raw = client.exec("id -u 2>/tmp/.null").await.unwrap_or_default();
            let ps_out = client
                .exec("ps | grep -iE 'cwmp|tr069|java|felix|vsftpd'")
                .await?;
            let lsmod_out = client.exec("lsmod | grep mirror").await.unwrap_or_default();
            let netstat_out = client
                .exec("netstat -nt 2>/tmp/.null")
                .await
                .unwrap_or_default();
            Ok::<_, String>((uid_raw, ps_out, lsmod_out, netstat_out))
        };

        let (telnet_res, sec_cfg) = tokio::join!(telnet_future, web.get_security_config());
        let (uid_raw, ps_out, lsmod_out, netstat_out) = telnet_res?;

        let uid = uid_raw
            .split_whitespace()
            .last()
            .unwrap_or("unknown")
            .to_string();
        let is_root = uid == "0";

        let mut tr_pid = None;
        let mut java_pid = None;
        let mut ftp_running = false;

        for line in ps_out.lines() {
            if line.contains("grep") {
                continue;
            }
            if line.contains("hgcwmp") {
                let pid = line.split_whitespace().next().unwrap_or("").to_string();
                tr_pid = Some(pid);
            } else if line.contains("java") || line.contains("felix") {
                let pid = line.split_whitespace().next().unwrap_or("").to_string();
                java_pid = Some(pid);
            } else if line.contains("vsftpd") {
                ftp_running = true;
            }
        }

        let tr069_running = tr_pid.is_some();
        let java_running = java_pid.is_some();
        let mirror_driver_loaded = lsmod_out.contains("hi_kport_mirror");

        let tr069_wan_enabled = sec_cfg.tr069_wan_enabled.unwrap_or(false);
        let tr069_wan_status = sec_cfg.tr069_wan_status.unwrap_or_else(|| {
            if tr069_wan_enabled {
                "Enabled".to_string()
            } else {
                "Disconnected".to_string()
            }
        });
        let mirror_active = sec_cfg.mirror_active.unwrap_or(false);
        let ftp_enabled = sec_cfg.ftp_enabled.unwrap_or(ftp_running);
        let ipv6_ra_enabled = sec_cfg.ipv6_ra_enabled.unwrap_or(false);
        let dhcpv6_enabled = sec_cfg.dhcpv6_enabled.unwrap_or(false);
        let external_connections = parse_external_connections(&netstat_out);

        let mut active_risks = Vec::new();
        if java_running {
            active_risks.push("Java DPI 运行中");
        }
        if tr069_wan_enabled {
            active_risks.push("TR-069 通道已启用");
        }
        if mirror_active {
            active_risks.push("流量镜像抓包活跃");
        }
        if ipv6_ra_enabled || dhcpv6_enabled {
            active_risks.push("LAN IPv6 RA/DHCPv6 开启");
        }
        if ftp_enabled || ftp_running {
            active_risks.push("冗余 FTP 端口开放");
        }
        if !external_connections.is_empty() {
            active_risks.push("存在公网外联");
        }

        let message = if active_risks.is_empty() {
            "审计通过：零监控外联、Java 已停、TR-069 隔离、镜像未启用、LAN IPv6 与 FTP 均已关闭"
                .to_string()
        } else {
            format!(
                "待优化项 ({})：{}",
                active_risks.len(),
                active_risks.join(" · ")
            )
        };

        Ok(SurveillanceStatus {
            is_root,
            uid,
            tr069_running,
            tr069_pid: tr_pid,
            tr069_wan_enabled,
            tr069_wan_status,
            java_running,
            java_pid,
            mirror_driver_loaded,
            mirror_active,
            ftp_running,
            ftp_enabled,
            ipv6_ra_enabled,
            dhcpv6_enabled,
            external_connections,
            message,
        })
    }

    /// Terminate Java DPI container (and lock startup script only if running as root)
    pub async fn kill_surveillance(
        client: &mut TelnetClient,
        web: &WebClient,
    ) -> Result<String, String> {
        let uid_raw = client.exec("id -u 2>/tmp/.null").await.unwrap_or_default();
        let uid = uid_raw.split_whitespace().last().unwrap_or("1005");
        let is_root = uid == "0";

        // 1. Kill java process (and any hung start_java wrapper)
        client
            .exec("killall -9 java start_java.sh 2>/tmp/.null")
            .await?;

        // 2. Lock startup script ONLY when root (non-root chmod silently fails)
        if is_root {
            client
                .exec("chmod 000 /usr/cmcc_app/conf/start_java.sh 2>/tmp/.null")
                .await?;
        }

        // 3. Verify
        let status = Self::check_surveillance(client, web).await?;
        if !status.java_running {
            if is_root {
                Ok("已停止 Java/DPI 监控容器并锁定自启脚本权限！".to_string())
            } else {
                Ok(format!(
                    "已停止 Java/DPI 容器并释放内存（当前 Telnet 为非 root 权限 uid={}，仅本次开机有效，重启光猫后可再次一键清理）",
                    uid
                ))
            }
        } else {
            Err(format!(
                "尝试停止后仍有 Java 进程运行 (PID: {})，可能是系统高权限进程，请检查权限",
                status.java_pid.unwrap_or_else(|| "?".to_string())
            ))
        }
    }

    /// Restore startup script permissions (when root) and launch Java OSGi container
    pub async fn restore_surveillance(
        client: &mut TelnetClient,
        web: &WebClient,
    ) -> Result<String, String> {
        let uid_raw = client.exec("touch /tmp/.null; id -u").await?;
        let is_root = uid_raw.lines().last().unwrap_or("").trim() == "0";

        if is_root {
            client
                .exec("chmod 777 /usr/cmcc_app/conf/start_java.sh 2>/tmp/.null")
                .await?;
        }

        // Avoid duplicate launch if already running
        let current = Self::check_surveillance(client, web).await?;
        if current.java_running {
            return Ok(format!(
                "Java 容器当前正在运行 (PID: {})",
                current.java_pid.unwrap_or_else(|| "?".to_string())
            ));
        }

        if is_root {
            let launch_check = client
                .exec("if [ -f /usr/bin/start_java.sh ]; then sh /usr/bin/start_java.sh </tmp/.null >/tmp/.null 2>&1 & echo OK; elif [ -f /usr/cmcc_app/conf/start_java.sh ]; then sh /usr/cmcc_app/conf/start_java.sh </tmp/.null >/tmp/.null 2>&1 & echo OK; else echo MISSING; fi")
                .await?;
            if launch_check.contains("MISSING") {
                return Err("未在光猫上找到 start_java.sh 启动脚本".to_string());
            }
        } else {
            // Non-root Telnet users (e.g. uid=1005) get blocked on `su osgi` tty password prompt inside start_java.sh;
            // launch the OpenJDK + Felix OSGi container directly as the current user instead.
            let bin_check = client
                .exec("[ -x /usr/cmcc_fwk/java/bin/java ] && [ -f /usr/cmcc_fwk/osgi/bin/felix.jar ] && echo READY || echo MISSING")
                .await?;
            if bin_check.contains("MISSING") {
                return Err("未找到 Java (/usr/cmcc_fwk/java/bin/java) 或 Felix 运行时".to_string());
            }

            client
                .exec("export OSGI_HOME=/usr/cmcc_fwk/osgi JAVA_HOME=/usr/cmcc_fwk/java")
                .await?;
            client
                .exec("export PATH=$JAVA_HOME/bin:$PATH LD_LIBRARY_PATH=/hgslib:$JAVA_HOME/lib/aarch32:$JAVA_HOME/lib/aarch32/client:$JAVA_HOME/lib/aarch32/jli:$LD_LIBRARY_PATH")
                .await?;
            client
                .exec("(cd $OSGI_HOME && mkdir -p /tmp/bundle0 && rm -rf /tmp/fileinstall-* && java -Dfelix.config.properties=file:/usr/cmcc_app/conf/config.properties -Dorg.ops4j.pax.logging.DefaultServiceLog.level=ERROR -Dgosh.args=--noi -Djava.net.preferIPv4Stack=false -Duser.timezone=GMT+8 -Djava.security.policy=./conf/all.policy -Dorg.osgi.framework.security=osgi -Dsun.net.inetaddr.ttl=30 -Dfile.encoding=utf-8 -Dsun.jnu.encoding=utf-8 -Xms48M -Xmx128M -Xss256k -jar bin/felix.jar </tmp/.null >/tmp/.null 2>&1 &)")
                .await?;
        }

        // Poll briefly for JVM process startup
        for _ in 0..4 {
            sleep(Duration::from_millis(1000)).await;
            let status = Self::check_surveillance(client, web).await?;
            if status.java_running {
                return Ok(format!(
                    "已成功启动 Java/DPI 容器！(PID: {})",
                    status.java_pid.unwrap_or_else(|| "?".to_string())
                ));
            }
        }

        Err("已触发后台启动，但未检测到 Java 进程存活，请展开日志或检查终端输出".to_string())
    }
}

fn parse_proc_stat_cpu(raw: &str) -> Option<CpuStatSample> {
    let line = raw.lines().find(|l| l.trim_start().starts_with("cpu "))?;
    let nums: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|s| s.parse::<u64>().ok())
        .collect();
    if nums.len() < 4 {
        return None;
    }
    let idle = nums[3] + nums.get(4).copied().unwrap_or(0); // idle + iowait
    let total: u64 = nums.iter().sum();
    Some(CpuStatSample { total, idle })
}

fn calc_cpu_usage_percent(s0: CpuStatSample, s1: CpuStatSample) -> f64 {
    let total_delta = s1.total.saturating_sub(s0.total);
    let idle_delta = s1.idle.saturating_sub(s0.idle);
    if total_delta == 0 {
        return 0.0;
    }
    let active = total_delta.saturating_sub(idle_delta);
    let pct = (active as f64 / total_delta as f64) * 100.0;
    ((pct * 10.0).round() / 10.0).clamp(0.0, 100.0)
}

fn format_uptime(up_secs: u64) -> String {
    let days = up_secs / 86400;
    let hours = (up_secs % 86400) / 3600;
    let mins = (up_secs % 3600) / 60;
    if days > 0 {
        format!("{}天 {}小时 {}分", days, hours, mins)
    } else {
        format!("{}小时 {}分", hours, mins)
    }
}

fn parse_external_connections(netstat_out: &str) -> Vec<String> {
    let mut external = Vec::new();
    for line in netstat_out.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("tcp") {
            continue;
        }
        let cols: Vec<&str> = trimmed.split_whitespace().collect();
        if cols.len() < 6 {
            continue;
        }
        let local = cols[3];
        let foreign = cols[4];
        let state = cols[5];
        if state.eq_ignore_ascii_case("LISTEN") {
            continue;
        }
        let remote_ip = extract_ip_from_addr(foreign);
        if !is_private_or_local_ip(remote_ip) {
            external.push(format!("{} → {} ({})", local, foreign, state));
        }
    }
    external
}

fn extract_ip_from_addr(addr: &str) -> &str {
    // Handle IPv4-mapped IPv6 like ::ffff:192.168.1.88:53855 or IPv4 192.168.1.88:53855
    let stripped = addr.strip_prefix("::ffff:").unwrap_or(addr);
    if let Some(bracketed) = stripped.strip_prefix('[')
        && let Some(end) = bracketed.find(']')
    {
        return &bracketed[..end];
    }
    if let Some(idx) = stripped.rfind(':') {
        &stripped[..idx]
    } else {
        stripped
    }
}

fn is_private_or_local_ip(ip: &str) -> bool {
    let t = ip.trim();
    if t.is_empty()
        || t == "0.0.0.0"
        || t == "*"
        || t == "::"
        || t == "::1"
        || t.starts_with("127.")
        || t.starts_with("10.")
        || t.starts_with("192.168.")
        || t.starts_with("169.254.")
        || t.starts_with("fe80:")
        || t.starts_with("fc")
        || t.starts_with("fd")
    {
        return true;
    }
    // 172.16.0.0 - 172.31.255.255
    if let Some(rest) = t.strip_prefix("172.")
        && let Some(second) = rest.split('.').next().and_then(|s| s.parse::<u8>().ok())
        && (16..=31).contains(&second)
    {
        return true;
    }
    // Carrier-grade NAT 100.64.0.0/10 is NOT treated as local LAN so carrier RMS/IPTV shows transparently if active
    false
}

#[cfg(test)]
mod tests {
    use super::{
        calc_cpu_usage_percent, format_uptime, parse_external_connections, parse_proc_stat_cpu,
    };

    #[test]
    fn test_proc_stat_real_cpu_delta() {
        let s0 = parse_proc_stat_cpu("cpu  408780 0 740720 58089621 12 0 89957 0 0 0").unwrap();
        let s1 = parse_proc_stat_cpu("cpu  408793 0 740752 58090854 12 0 89960 0 0 0").unwrap();
        let pct = calc_cpu_usage_percent(s0, s1);
        assert_eq!(pct, 3.7);
    }

    #[test]
    fn test_format_uptime() {
        assert_eq!(format_uptime(298688), "3天 10小时 58分");
        assert_eq!(format_uptime(3720), "1小时 2分");
    }

    #[test]
    fn test_parse_external_connections() {
        let sample = "\
Active Internet connections (w/o servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State
tcp        0      0 192.168.1.1:80          0.0.0.0:*               LISTEN
tcp        0    207 192.168.1.1:23          192.168.1.88:53855      ESTABLISHED
tcp        0      0 100.64.1.2:41234        111.13.101.208:9092     ESTABLISHED
";
        let ext = parse_external_connections(sample);
        assert_eq!(ext.len(), 1);
        assert!(ext[0].contains("111.13.101.208:9092"));
    }

    #[tokio::test]
    #[ignore = "Live hardware smoke test against optical modem"]
    async fn live_smoke_test_modem() {
        let ip = std::env::var("MODEM_TEST_IP").unwrap_or_else(|_| "192.168.1.1".to_string());
        let web = crate::web_client::WebClient::new(&ip);
        let auto = web.auto_detect_and_enable().await.expect("auto_detect");
        assert!(auto.port_open, "port 23 should be open");

        let mut telnet = crate::telnet_client::TelnetClient::connect(
            &ip,
            23,
            &auto.telnet_user,
            &auto.telnet_pass,
        )
        .await
        .expect("telnet connect");

        let sys = super::ModemManager::get_system_info(&mut telnet, &web)
            .await
            .expect("get_system_info");
        println!("LIVE SystemInfo: {:#?}", sys);
        assert!(sys.ram_total_mb > 100);
        assert!(sys.cpu_usage_percent >= 0.0 && sys.cpu_usage_percent <= 100.0);

        let surv = super::ModemManager::check_surveillance(&mut telnet, &web)
            .await
            .expect("check_surveillance");
        println!("LIVE SurveillanceStatus: {:#?}", surv);

        let creds = super::ModemManager::get_credentials(&mut telnet, &web)
            .await
            .expect("get_credentials");
        println!(
            "LIVE Credentials OK: pppoe_user={:?}, gpon={:?}, sn={:?}, mac={:?}, admin={:?}",
            creds.pppoe_username.is_some(),
            creds.gpon_password.is_some(),
            creds.serial_number,
            creds.base_mac,
            creds.admin_password.is_some()
        );
        assert!(creds.pppoe_username.is_some());
        assert!(creds.gpon_password.is_some());
        assert!(creds.serial_number.is_some());
    }
}
