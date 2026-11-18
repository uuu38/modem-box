use serde::{Deserialize, Serialize};
use regex::Regex;
use crate::telnet_client::TelnetClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub cpu_model: String,
    pub cpu_cores: usize,
    pub temperature: String,
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
    pub base_mac: Option<String>,
    pub admin_username: Option<String>,
    pub admin_password: Option<String>,
    pub user_password: Option<String>,
    pub acs_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveillanceStatus {
    pub tr069_running: bool,
    pub tr069_pid: Option<String>,
    pub java_running: bool,
    pub java_pid: Option<String>,
    pub mirror_driver_loaded: bool,
    pub message: String,
}

pub struct ModemManager;

impl ModemManager {
    /// Retrieve and parse real-time system hardware & network state
    pub async fn get_system_info(client: &mut TelnetClient) -> Result<SystemInfo, String> {
        let cpu_info = client.exec("cat /proc/cpuinfo").await?;
        let temp_raw = client.exec("cat /sys/class/thermal/thermal_zone0/temp 2>/tmp/.null").await.unwrap_or_default();
        let uptime_raw = client.exec("cat /proc/uptime").await.unwrap_or_default();
        let mem_info = client.exec("cat /proc/meminfo").await?;
        let pon_raw = client.exec("cat /tmp/cmcc_pon_state 2>/tmp/.null").await.unwrap_or_default();
        let kernel = client.exec("uname -r").await.unwrap_or_else(|_| "5.10.0".to_string());
        let brctl_raw = client.exec("brctl show").await.unwrap_or_default();

        // Parse CPU
        let cpu_model = cpu_info.lines()
            .find(|l| l.contains("model name"))
            .map(|l| l.split(':').nth(1).unwrap_or("").trim().to_string())
            .unwrap_or_else(|| "ARMv7 Processor".to_string());

        let cpu_cores = cpu_info.lines().filter(|l| l.starts_with("processor")).count().max(1);

        // Parse Temp
        let temp_num: u64 = temp_raw.trim().parse().unwrap_or(60000);
        let temperature = format!("{}°C", temp_num / 1000);

        // Parse Uptime
        let up_secs: u64 = uptime_raw.split_whitespace().next().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0) as u64;
        let hours = up_secs / 3600;
        let mins = (up_secs % 3600) / 60;
        let uptime = format!("{}小时{}分钟", hours, mins);

        // Parse RAM
        let mut tot_kb = 0u64;
        let mut free_kb = 0u64;
        let mut avail_kb = 0u64;

        for line in mem_info.lines() {
            if line.starts_with("MemTotal:") {
                tot_kb = line.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            } else if line.starts_with("MemFree:") {
                free_kb = line.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            } else if line.starts_with("MemAvailable:") {
                avail_kb = line.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            }
        }
        if avail_kb == 0 { avail_kb = free_kb; }

        let ram_total_mb = tot_kb / 1024;
        let ram_free_mb = avail_kb / 1024;
        let ram_used_mb = ram_total_mb.saturating_sub(ram_free_mb);
        let ram_usage_percent = if ram_total_mb > 0 { (ram_used_mb * 100) / ram_total_mb } else { 0 };

        // Parse PON
        let pon_status = if pon_raw.trim() == "1" {
            "已注册上线 (Registered)".to_string()
        } else {
            "未就绪 / 同步中".to_string()
        };

        // Parse WAN Mode
        let wan_mode = if brctl_raw.contains("wan_") {
            "桥接模式 (Bridge)".to_string()
        } else {
            "路由模式 (Route)".to_string()
        };

        Ok(SystemInfo {
            cpu_model,
            cpu_cores,
            temperature,
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

    /// Extract sensitive authentication & line credentials from lastgood.xml
    pub async fn get_credentials(client: &mut TelnetClient) -> Result<Credentials, String> {
        let xml_snippet = client.exec("grep -E '(aucPassword|aucUsername|aucPasswd|aucTeleAccountPassword|aucAcsUrl|BaseMacAddr|aucUserAccountPassword)' /config/work/lastgood.xml").await?;
        let mac_raw = client.exec("hbus .Profile.BaseMacAddr 2>/tmp/.null").await.unwrap_or_default();

        let mut creds = Credentials {
            pppoe_username: None,
            pppoe_password: None,
            gpon_password: None,
            base_mac: None,
            admin_username: Some("CMCCAdmin".to_string()),
            admin_password: None,
            user_password: None,
            acs_url: None,
        };

        // Parse MAC
        let re_mac = Regex::new(r"([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})").unwrap();
        if let Some(m) = re_mac.find(&mac_raw) {
            creds.base_mac = Some(m.as_str().to_string());
        }

        for line in xml_snippet.lines() {
            if line.contains("aucTeleAccountPassword") {
                if let Some(val) = extract_xml_val(line) {
                    creds.admin_password = Some(val);
                }
            } else if line.contains("aucUserAccountPassword") {
                if let Some(val) = extract_xml_val(line) {
                    creds.user_password = Some(val);
                }
            } else if line.contains("aucPasswd") && !line.contains("aucKeyPassphrase") {
                if let Some(val) = extract_xml_val(line) {
                    if !val.is_empty() && creds.gpon_password.is_none() {
                        creds.gpon_password = Some(val);
                    }
                }
            } else if line.contains("aucAcsUrl") {
                if let Some(val) = extract_xml_val(line) {
                    if val.starts_with("http") {
                        creds.acs_url = Some(val);
                    }
                }
            } else if line.contains("aucUsername") {
                if let Some(val) = extract_xml_val(line) {
                    if val.len() >= 6 && val.chars().all(|c| c.is_ascii_digit()) && creds.pppoe_username.is_none() {
                        creds.pppoe_username = Some(val);
                    }
                }
            } else if line.contains("aucPassword") {
                if let Some(val) = extract_xml_val(line) {
                    if val.len() >= 6 && creds.pppoe_password.is_none() && creds.admin_password.as_deref() != Some(&val) {
                        creds.pppoe_password = Some(val);
                    }
                }
            }
        }

        Ok(creds)
    }

    /// Audit surveillance processes (TR-069, Java DPI, port mirror)
    pub async fn check_surveillance(client: &mut TelnetClient) -> Result<SurveillanceStatus, String> {
        let ps_out = client.exec("ps | grep -iE 'cwmp|tr069|java|felix'").await?;
        let lsmod_out = client.exec("lsmod | grep mirror").await.unwrap_or_default();

        let mut tr_pid = None;
        let mut java_pid = None;

        for line in ps_out.lines() {
            if line.contains("grep") { continue; }
            if line.contains("hgcwmp") {
                let pid = line.split_whitespace().next().unwrap_or("").to_string();
                tr_pid = Some(pid);
            } else if line.contains("java") || line.contains("felix") {
                let pid = line.split_whitespace().next().unwrap_or("").to_string();
                java_pid = Some(pid);
            }
        }

        let tr069_running = tr_pid.is_some();
        let java_running = java_pid.is_some();
        let mirror_driver_loaded = lsmod_out.contains("hi_kport_mirror");

        let message = format!(
            "TR-069: {}, Java DPI: {}, 端口镜像驱动: {}",
            if tr069_running { "运行中" } else { "未运行" },
            if java_running { "运行中" } else { "已停止" },
            if mirror_driver_loaded { "已加载" } else { "未加载" }
        );

        Ok(SurveillanceStatus {
            tr069_running,
            tr069_pid: tr_pid,
            java_running,
            java_pid,
            mirror_driver_loaded,
            message,
        })
    }

    /// Terminate Java DPI container and lock startup scripts to release memory
    pub async fn kill_surveillance(client: &mut TelnetClient) -> Result<String, String> {
        // 1. Kill java process
        client.exec("killall -9 java 2>/tmp/.null").await?;

        // 2. Lock startup script
        client.exec("chmod 000 /usr/cmcc_app/conf/start_java.sh 2>/tmp/.null").await?;

        // 3. Verify
        let status = Self::check_surveillance(client).await?;
        if !status.java_running {
            Ok("成功停止 Java/DPI 监控容器并锁定自启，内存已完全释放！".to_string())
        } else {
            Err("尝试停止后仍有 Java 进程残留，请重试".to_string())
        }
    }
}

fn extract_xml_val(line: &str) -> Option<String> {
    let re = Regex::new(r#"Value="([^"]*)""#).ok()?;
    re.captures(line).map(|cap| cap[1].to_string())
}
