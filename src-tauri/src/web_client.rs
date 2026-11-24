use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnableTelnetResult {
    pub success: bool,
    pub port_open: bool,
    pub telnet_user: Option<String>,
    pub telnet_pass: Option<String>,
    pub steps: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoDetectResult {
    pub success: bool,
    pub ip: String,
    pub port_open: bool,
    pub telnet_user: String,
    pub telnet_pass: String,
    pub telnet_enabled_in_cfg: bool,
    pub was_already_running: bool,
    pub steps: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, Default)]
pub struct DeviceTelemetry {
    pub model_name: Option<String>,
    pub serial_number: Option<String>,
    pub software_version: Option<String>,
    pub soc_chip: Option<String>,
    pub pon_link_status: Option<String>,
    pub optical_temp_c: Option<f64>,
    pub rx_power_dbm: Option<f64>,
    pub tx_power_dbm: Option<f64>,
}

#[derive(Debug, Clone, Default)]
pub struct SecurityWebConfig {
    pub ftp_enabled: Option<bool>,
    pub tr069_wan_enabled: Option<bool>,
    pub tr069_wan_status: Option<String>,
    pub ipv6_ra_enabled: Option<bool>,
    pub dhcpv6_enabled: Option<bool>,
    pub mirror_active: Option<bool>,
}

fn parse_bool_flag(v: &Value) -> Option<bool> {
    if let Some(b) = v.as_bool() {
        return Some(b);
    }
    if let Some(s) = v.as_str() {
        let t = s.trim();
        if t == "1" || t.eq_ignore_ascii_case("true") {
            return Some(true);
        }
        if t == "0" || t.eq_ignore_ascii_case("false") {
            return Some(false);
        }
    }
    if let Some(n) = v.as_i64() {
        return Some(n != 0);
    }
    None
}

fn parse_non_empty_str(obj: &Value, key: &str) -> Option<String> {
    obj.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Convert raw GPON optical power (0.1 uW unit, i.e. value / 10000 mW) to dBm rounded to 1 decimal
pub fn calc_optical_dbm(raw_str: &str) -> Option<f64> {
    let val = raw_str.trim().parse::<f64>().ok()?;
    if val <= 0.0 {
        return None;
    }
    let dbm = 10.0 * (val / 10000.0).log10();
    if (-45.0..=15.0).contains(&dbm) {
        Some((dbm * 10.0).round() / 10.0)
    } else {
        None
    }
}

/// Convert raw SFF-8472 transceiver temperature (1/256 °C unit) to °C rounded to 1 decimal
pub fn calc_optical_temp_c(raw_str: &str) -> Option<f64> {
    let val = raw_str.trim().parse::<f64>().ok()?;
    let temp = if val > 256.0 { val / 256.0 } else { val };
    if (-20.0..=120.0).contains(&temp) {
        Some((temp * 10.0).round() / 10.0)
    } else {
        None
    }
}

pub struct WebClient {
    client: Client,
    ip: String,
    base_url: String,
}

/// Validate modem password rule:
/// Must contain letters, digits, and special characters, no spaces, length > 8
pub fn validate_telnet_password(password: &str) -> Result<(), String> {
    if password.len() <= 8 {
        return Err(format!(
            "密码格式错误：密码长度必须大于 8 位（当前 {} 位）！",
            password.len()
        ));
    }
    if password.chars().any(char::is_whitespace) {
        return Err("密码格式错误：密码不能包含空格！".to_string());
    }
    let has_letter = password.chars().any(|c| c.is_ascii_alphabetic());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    let has_special = password
        .chars()
        .any(|c| !c.is_ascii_alphanumeric() && !c.is_whitespace());

    if !has_letter {
        return Err("密码格式错误：必须包含至少一个英文字母！".to_string());
    }
    if !has_digit {
        return Err("密码格式错误：必须包含至少一个数字！".to_string());
    }
    if !has_special {
        return Err("密码格式错误：必须包含至少一个特殊字符（例如 %、#、*、@ 等）！".to_string());
    }
    Ok(())
}

impl WebClient {
    pub fn new(ip: &str) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(5))
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            ip: ip.to_string(),
            base_url: format!("http://{}", ip),
        }
    }

    /// Check if TCP port 23 is reachable on the modem
    pub async fn check_telnet_port(&self) -> bool {
        let addr = format!("{}:23", self.ip);
        matches!(
            timeout(Duration::from_secs(2), TcpStream::connect(&addr)).await,
            Ok(Ok(_))
        )
    }

    /// Auto-detect and ensure Telnet is running on app startup
    /// 1. Reads current Telnet user, pass, and enabled state via /getObjs
    /// 2. If port 23 is already open, returns immediately
    /// 3. If port 23 is closed, automatically triggers /setObjs with TelnetEnable: true
    /// 4. Verifies port 23
    pub async fn auto_detect_and_enable(&self) -> Result<AutoDetectResult, String> {
        let mut steps = Vec::new();
        steps.push(format!("🔍 [1/3] 正在探测光猫设备 (http://{})...", self.ip));

        let get_url = format!("{}/getObjs?waitTimeoutMs=5000", self.base_url);
        let get_body = r#"[{"fullPath":"InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage."}]"#;

        let mut telnet_user = "CMCCAdmin".to_string();
        let mut telnet_pass = "aDm8H%MdA".to_string();
        let mut cfg_enabled = false;

        let query_res = self
            .client
            .post(&get_url)
            .header(
                "Content-Type",
                "application/x-www-form-urlencoded; charset=UTF-8",
            )
            .header("X-Requested-With", "XMLHttpRequest")
            .body(get_body)
            .send()
            .await
            .map_err(|e| {
                format!(
                    "无法连接光猫 (http://{}): {}。请确认电脑网线或 Wi-Fi 已连接光猫。",
                    self.ip, e
                )
            })?;

        if let Ok(text) = query_res.text().await
            && let Ok(arr) = serde_json::from_str::<Value>(&text)
            && let Some(obj) = arr.as_array().and_then(|a| a.first())
        {
            if let Some(u) = obj.get("TelnetUserName").and_then(|v| v.as_str())
                && !u.is_empty()
            {
                telnet_user = u.to_string();
            }
            if let Some(p) = obj.get("TelnetPassword").and_then(|v| v.as_str())
                && !p.is_empty()
            {
                telnet_pass = p.to_string();
            }
            if let Some(en) = obj.get("TelnetEnable").and_then(|v| v.as_str()) {
                cfg_enabled = en == "1" || en.eq_ignore_ascii_case("true");
            }
            steps.push(format!(
                "✅ [1/3] 自动读取到光猫凭据 -> 账号: [{}], 密码: [{}], 配置开关: {}",
                telnet_user,
                telnet_pass,
                if cfg_enabled {
                    "已启用"
                } else {
                    "未启用"
                }
            ));
        }

        if steps.len() == 1 {
            steps.push(format!(
                "ℹ️ [1/3] 未能解析到服务配置，采用默认凭据: [{}] / [{}]",
                telnet_user, telnet_pass
            ));
        }

        // Check if port 23 is already open
        steps.push(format!("🔍 [2/3] 检测 {}:23 端口状态...", self.ip));
        let already_open = self.check_telnet_port().await;

        if already_open {
            steps.push("🎉 [3/3] 检测到 Telnet 服务已处于在线运行状态！无需重新开启。".to_string());
            let msg = format!(
                "🎉 光猫已就绪！Telnet 23 端口已在线 (账号: {})",
                telnet_user
            );
            return Ok(AutoDetectResult {
                success: true,
                ip: self.ip.clone(),
                port_open: true,
                telnet_user,
                telnet_pass,
                telnet_enabled_in_cfg: cfg_enabled,
                was_already_running: true,
                steps,
                message: msg,
            });
        }

        // Not open yet -> Trigger /setObjs to enable it
        steps.push("⚡ [2/3] 23 端口未开放，正在自动下发 Telnet 开启指令...".to_string());
        let set_url = format!("{}/setObjs", self.base_url);
        let set_payload = serde_json::json!([{
            "TelnetEnable": true,
            "TelnetUserName": telnet_user,
            "TelnetPassword": telnet_pass,
            "fullPath": "InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage."
        }]);

        let set_res = self
            .client
            .post(&set_url)
            .header(
                "Content-Type",
                "application/x-www-form-urlencoded; charset=UTF-8",
            )
            .header("X-Requested-With", "XMLHttpRequest")
            .body(set_payload.to_string())
            .send()
            .await
            .map_err(|e| format!("自动开启 Telnet 请求失败: {}", e))?;

        let status = set_res.status();
        steps.push(format!(
            "✅ [2/3] 开启指令下发成功 (HTTP {})",
            status.as_u16()
        ));

        // Probe port 23
        steps.push(format!("🔍 [3/3] 正在验证 {}:23 端口连通性...", self.ip));
        let mut port_open = false;
        for i in 1..=4 {
            if self.check_telnet_port().await {
                port_open = true;
                break;
            }
            if i < 4 {
                sleep(Duration::from_millis(600)).await;
            }
        }

        if port_open {
            steps.push(format!("🎉 [3/3] 连通成功！{}:23 端口已就绪！", self.ip));
            Ok(AutoDetectResult {
                success: true,
                ip: self.ip.clone(),
                port_open: true,
                telnet_user,
                telnet_pass,
                telnet_enabled_in_cfg: true,
                was_already_running: false,
                steps,
                message: "🎉 自动开启 Telnet 成功！光猫已连接就绪。".to_string(),
            })
        } else {
            steps.push("❌ [3/3] 指令已发送，但 23 端口仍未响应".to_string());
            Ok(AutoDetectResult {
                success: false,
                ip: self.ip.clone(),
                port_open: false,
                telnet_user,
                telnet_pass,
                telnet_enabled_in_cfg: cfg_enabled,
                was_already_running: false,
                steps,
                message: "已向光猫发送开启指令，但 23 端口暂未响应，请检查光猫连接或手动开启"
                    .to_string(),
            })
        }
    }

    /// Enable Telnet and optionally set custom username/password (Manual Mode)
    pub async fn enable_telnet_direct(
        &self,
        custom_user: Option<&str>,
        custom_pass: Option<&str>,
    ) -> Result<EnableTelnetResult, String> {
        let mut steps = Vec::new();

        // 1. Query current service management info
        let get_url = format!("{}/getObjs?waitTimeoutMs=5000", self.base_url);
        let get_body = r#"[{"fullPath":"InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage."}]"#;

        let mut current_user = "CMCCAdmin".to_string();
        let mut current_pass = "aDm8H%MdA".to_string();

        let query_res = self
            .client
            .post(&get_url)
            .header(
                "Content-Type",
                "application/x-www-form-urlencoded; charset=UTF-8",
            )
            .header("X-Requested-With", "XMLHttpRequest")
            .body(get_body)
            .send()
            .await;

        if let Ok(resp) = query_res
            && let Ok(text) = resp.text().await
            && let Ok(arr) = serde_json::from_str::<Value>(&text)
            && let Some(obj) = arr.as_array().and_then(|a| a.first())
        {
            if let Some(u) = obj.get("TelnetUserName").and_then(|v| v.as_str())
                && !u.is_empty()
            {
                current_user = u.to_string();
            }
            if let Some(p) = obj.get("TelnetPassword").and_then(|v| v.as_str())
                && !p.is_empty()
            {
                current_pass = p.to_string();
            }
            steps.push(format!(
                "✅ [1/3] 从光猫读取到当前配置：账号 [{}]，密码 [{}]",
                current_user, current_pass
            ));
        }

        // 2. Determine target user & password
        let final_user = match custom_user {
            Some(u) if !u.trim().is_empty() => u.trim().to_string(),
            _ => current_user,
        };

        let final_pass = match custom_pass {
            Some(p) if !p.trim().is_empty() => {
                let trimmed = p.trim();
                // Validate format
                validate_telnet_password(trimmed)?;
                trimmed.to_string()
            }
            _ => current_pass,
        };

        // 3. Post /setObjs to enable Telnet with specified credentials
        let set_url = format!("{}/setObjs", self.base_url);
        let set_payload = serde_json::json!([{
            "TelnetEnable": true,
            "TelnetUserName": final_user,
            "TelnetPassword": final_pass,
            "fullPath": "InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage."
        }]);

        let set_res = self
            .client
            .post(&set_url)
            .header(
                "Content-Type",
                "application/x-www-form-urlencoded; charset=UTF-8",
            )
            .header("X-Requested-With", "XMLHttpRequest")
            .body(set_payload.to_string())
            .send()
            .await
            .map_err(|e| format!("请求 /setObjs 失败: {}", e))?;

        let status = set_res.status();
        let resp_text = set_res.text().await.unwrap_or_default();
        steps.push(format!(
            "✅ [2/3] 下发开启与凭据配置成功 (HTTP {}) -> 账号: [{}], 密码: [{}]",
            status.as_u16(),
            final_user,
            final_pass
        ));
        if !resp_text.is_empty() {
            steps.push(format!("    设备返回: {}", resp_text));
        }

        // 4. Probe port 23
        let mut port_open = false;
        for i in 1..=4 {
            if self.check_telnet_port().await {
                port_open = true;
                break;
            }
            if i < 4 {
                sleep(Duration::from_millis(600)).await;
            }
        }

        if port_open {
            steps.push(format!(
                "✅ [3/3] 实测 {}:23 端口已连通！Telnet 开启成功！",
                self.ip
            ));
            Ok(EnableTelnetResult {
                success: true,
                port_open: true,
                telnet_user: Some(final_user),
                telnet_pass: Some(final_pass),
                steps,
                message: format!("🎉 Telnet 开启成功！({}:23 已就绪)", self.ip),
            })
        } else {
            steps.push(format!(
                "❌ [3/3] 指令已发送，但 {}:23 端口暂未响应",
                self.ip
            ));
            Ok(EnableTelnetResult {
                success: false,
                port_open: false,
                telnet_user: Some(final_user),
                telnet_pass: Some(final_pass),
                steps,
                message: "已向光猫发送开启指令，但 23 端口尚未开放，请稍等 3 秒后再试".to_string(),
            })
        }
    }

    async fn post_get_objs(&self, paths: &[&str]) -> Result<Vec<Value>, String> {
        let get_url = format!("{}/getObjs?waitTimeoutMs=5000", self.base_url);
        let payload: Vec<Value> = paths
            .iter()
            .map(|p| serde_json::json!({ "fullPath": p }))
            .collect();

        let resp = self
            .client
            .post(&get_url)
            .header(
                "Content-Type",
                "application/x-www-form-urlencoded; charset=UTF-8",
            )
            .header("X-Requested-With", "XMLHttpRequest")
            .body(serde_json::to_string(&payload).unwrap_or_default())
            .send()
            .await
            .map_err(|e| format!("查询光猫配置失败: {}", e))?;

        let text = resp
            .text()
            .await
            .map_err(|e| format!("读取光猫配置响应失败: {}", e))?;

        serde_json::from_str::<Vec<Value>>(&text)
            .map_err(|e| format!("解析光猫 JSON 响应失败: {}", e))
    }

    async fn post_set_objs(&self, payload: Value) -> Result<(), String> {
        let set_url = format!("{}/setObjs", self.base_url);
        let resp = self
            .client
            .post(&set_url)
            .header(
                "Content-Type",
                "application/x-www-form-urlencoded; charset=UTF-8",
            )
            .header("X-Requested-With", "XMLHttpRequest")
            .body(payload.to_string())
            .send()
            .await
            .map_err(|e| format!("下发光猫配置失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "光猫拒绝配置写入 (HTTP {})",
                resp.status().as_u16()
            ));
        }
        Ok(())
    }

    /// Query device metadata & live GPON optical transceiver telemetry via HTTP /getObjs
    pub async fn get_device_telemetry(&self) -> DeviceTelemetry {
        let mut out = DeviceTelemetry::default();
        let Ok(objs) = self
            .post_get_objs(&[
                "InternetGatewayDevice.DeviceInfo.",
                "InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.",
            ])
            .await
        else {
            return out;
        };

        for obj in objs {
            let fp = obj.get("fullPath").and_then(|v| v.as_str()).unwrap_or("");
            if fp == "InternetGatewayDevice.DeviceInfo." {
                out.model_name = parse_non_empty_str(&obj, "ModelName");
                out.serial_number = parse_non_empty_str(&obj, "SerialNumber");
                out.software_version = parse_non_empty_str(&obj, "SoftwareVersion");
                out.soc_chip = parse_non_empty_str(&obj, "X_CMCC_CPUClass");
            } else if fp == "InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig." {
                out.pon_link_status = parse_non_empty_str(&obj, "Status");
                if let Some(t) = parse_non_empty_str(&obj, "TransceiverTemperature") {
                    out.optical_temp_c = calc_optical_temp_c(&t);
                }
                if let Some(rx) = parse_non_empty_str(&obj, "RXPower") {
                    out.rx_power_dbm = calc_optical_dbm(&rx);
                }
                if let Some(tx) = parse_non_empty_str(&obj, "TXPower") {
                    out.tx_power_dbm = calc_optical_dbm(&tx);
                }
            }
        }

        out
    }

    /// Query security & hardening settings via HTTP /getObjs and /mirrorCfg
    pub async fn get_security_config(&self) -> SecurityWebConfig {
        let mut cfg = SecurityWebConfig::default();

        if let Ok(objs) = self
            .post_get_objs(&[
                "InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage.",
                "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.",
                "InternetGatewayDevice.LANDevice.1.X_CMCC_RouterAdvertisement.",
                "InternetGatewayDevice.LANDevice.1.X_CMCC_DHCPv6Server.",
            ])
            .await
        {
            for obj in objs {
                let fp = obj.get("fullPath").and_then(|v| v.as_str()).unwrap_or("");
                if fp == "InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage." {
                    cfg.ftp_enabled = obj.get("FtpEnable").and_then(parse_bool_flag);
                } else if fp
                    == "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1."
                {
                    let is_tr069 = parse_non_empty_str(&obj, "X_CMCC_ServiceList")
                        .map(|s| s.to_ascii_uppercase().contains("TR069"))
                        .unwrap_or(false)
                        || parse_non_empty_str(&obj, "Name")
                            .map(|s| s.to_ascii_uppercase().contains("TR069"))
                            .unwrap_or(false);
                    if is_tr069 {
                        cfg.tr069_wan_enabled = obj.get("Enable").and_then(parse_bool_flag);
                        cfg.tr069_wan_status = parse_non_empty_str(&obj, "ConnectionStatus");
                    }
                } else if fp == "InternetGatewayDevice.LANDevice.1.X_CMCC_RouterAdvertisement." {
                    cfg.ipv6_ra_enabled = obj.get("Enable").and_then(parse_bool_flag);
                } else if fp == "InternetGatewayDevice.LANDevice.1.X_CMCC_DHCPv6Server." {
                    cfg.dhcpv6_enabled = obj.get("Enable").and_then(parse_bool_flag);
                }
            }
        }

        // Check actual runtime port mirror rules via /mirrorCfg?action=get
        let mirror_url = format!("{}/mirrorCfg?action=get", self.base_url);
        if let Ok(resp) = self.client.get(&mirror_url).send().await
            && let Ok(text) = resp.text().await
            && let Ok(val) = serde_json::from_str::<Value>(text.trim())
        {
            let active = match val {
                Value::Object(map) => !map.is_empty(),
                Value::Array(arr) => !arr.is_empty(),
                _ => false,
            };
            cfg.mirror_active = Some(active);
        }

        cfg
    }

    /// Toggle modem built-in FTP service (vsftpd, port 21) via /setObjs
    pub async fn set_ftp_enabled(&self, enable: bool) -> Result<String, String> {
        let payload = serde_json::json!([{
            "fullPath": "InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage.",
            "FtpEnable": enable
        }]);
        self.post_set_objs(payload).await?;

        sleep(Duration::from_millis(500)).await;
        let verify = self.get_security_config().await;
        if verify.ftp_enabled == Some(enable) {
            Ok(if enable {
                "已开启光猫内置 FTP 服务 (21 端口)".to_string()
            } else {
                "已关闭光猫内置 FTP 服务 (21 端口)，永久生效".to_string()
            })
        } else {
            Err("已发送 FTP 开关指令，但读取校验结果未变更，请稍后重新扫描确认".to_string())
        }
    }

    /// Toggle modem LAN IPv6 Router Advertisement (RA) & DHCPv6 Server via /setObjs
    pub async fn set_lan_ipv6_enabled(&self, enable: bool) -> Result<String, String> {
        let payload = serde_json::json!([
            {
                "fullPath": "InternetGatewayDevice.LANDevice.1.X_CMCC_RouterAdvertisement.",
                "Enable": enable
            },
            {
                "fullPath": "InternetGatewayDevice.LANDevice.1.X_CMCC_DHCPv6Server.",
                "Enable": enable
            }
        ]);
        self.post_set_objs(payload).await?;

        sleep(Duration::from_millis(700)).await;
        let verify = self.get_security_config().await;
        if verify.ipv6_ra_enabled == Some(enable) && verify.dhcpv6_enabled == Some(enable) {
            Ok(if enable {
                "已恢复光猫 LAN 侧 IPv6 RA 与 DHCPv6 服务".to_string()
            } else {
                "已关闭光猫 LAN 侧 IPv6 RA 路由通告与 DHCPv6，防止桥接下发 fe80::1 假网关（重启不丢失）".to_string()
            })
        } else {
            Err("已发送 LAN IPv6 配置指令，但读取校验结果未完全匹配，请重新扫描确认".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{calc_optical_dbm, calc_optical_temp_c, validate_telnet_password};

    #[test]
    fn test_valid_passwords() {
        assert!(validate_telnet_password("aDm8H%MdA").is_ok());
        assert!(validate_telnet_password("Pass1234#").is_ok());
        assert!(validate_telnet_password("Super_Admin_2026").is_ok());
    }

    #[test]
    fn test_invalid_passwords() {
        assert!(validate_telnet_password("Aa1!").is_err());
        assert!(validate_telnet_password("Aa1!5678").is_err());
        assert!(validate_telnet_password("Aa 1234567!").is_err());
        assert!(validate_telnet_password("Aa123456789").is_err());
        assert!(validate_telnet_password("AaBbCcDdEe!").is_err());
        assert!(validate_telnet_password("1234567890!@#").is_err());
    }

    #[test]
    fn test_optical_telemetry_conversions() {
        assert_eq!(calc_optical_dbm("132"), Some(-18.8));
        assert_eq!(calc_optical_dbm("17866"), Some(2.5));
        assert_eq!(calc_optical_dbm("0"), None);
        assert_eq!(calc_optical_temp_c("11008"), Some(43.0));
    }
}
