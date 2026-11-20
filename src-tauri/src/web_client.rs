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

    /// Enable Telnet and optionally set custom username/password
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
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            .header("X-Requested-With", "XMLHttpRequest")
            .body(get_body)
            .send()
            .await;

        if let Ok(resp) = query_res {
            if let Ok(text) = resp.text().await {
                if let Ok(arr) = serde_json::from_str::<Value>(&text) {
                    if let Some(obj) = arr.as_array().and_then(|a| a.first()) {
                        if let Some(u) = obj.get("TelnetUserName").and_then(|v| v.as_str()) {
                            if !u.is_empty() {
                                current_user = u.to_string();
                            }
                        }
                        if let Some(p) = obj.get("TelnetPassword").and_then(|v| v.as_str()) {
                            if !p.is_empty() {
                                current_pass = p.to_string();
                            }
                        }
                        steps.push(format!(
                            "✅ [1/3] 从光猫读取到当前配置：账号 [{}]，密码 [{}]",
                            current_user, current_pass
                        ));
                    }
                }
            }
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
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
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
            steps.push(format!("✅ [3/3] 实测 {}:23 端口已连通！Telnet 开启成功！", self.ip));
            Ok(EnableTelnetResult {
                success: true,
                port_open: true,
                telnet_user: Some(final_user),
                telnet_pass: Some(final_pass),
                steps,
                message: format!("🎉 Telnet 开启成功！({}:23 已就绪)", self.ip),
            })
        } else {
            steps.push(format!("❌ [3/3] 指令已发送，但 {}:23 端口暂未响应", self.ip));
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
}

#[cfg(test)]
mod tests {
    use super::validate_telnet_password;

    #[test]
    fn test_valid_passwords() {
        assert!(validate_telnet_password("aDm8H%MdA").is_ok());
        assert!(validate_telnet_password("Pass1234#").is_ok());
        assert!(validate_telnet_password("Super_Admin_2026").is_ok());
    }

    #[test]
    fn test_invalid_passwords() {
        // <= 8 chars
        assert!(validate_telnet_password("Aa1!").is_err());
        assert!(validate_telnet_password("Aa1!5678").is_err()); // exactly 8 chars -> error

        // contains space
        assert!(validate_telnet_password("Aa 1234567!").is_err());

        // missing special
        assert!(validate_telnet_password("Aa123456789").is_err());

        // missing digits
        assert!(validate_telnet_password("AaBbCcDdEe!").is_err());

        // missing letters
        assert!(validate_telnet_password("1234567890!@#").is_err());
    }
}
