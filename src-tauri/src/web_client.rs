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

    /// Enable Telnet using the zero-authentication /setObjs & /getObjs API
    /// 1. Query /getObjs for current TelnetUserName & TelnetPassword
    /// 2. Post /setObjs with TelnetEnable: true
    /// 3. Verify port 23 connectivity
    pub async fn enable_telnet_direct(
        &self,
        fallback_user: Option<&str>,
        fallback_pass: Option<&str>,
    ) -> Result<EnableTelnetResult, String> {
        let mut steps = Vec::new();

        // Step 1: Query current service management info
        let get_url = format!("{}/getObjs?waitTimeoutMs=5000", self.base_url);
        let get_body = r#"[{"fullPath":"InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage."}]"#;

        let mut telnet_user = fallback_user.unwrap_or("CMCCAdmin").to_string();
        let mut telnet_pass = fallback_pass.unwrap_or("aDm8H%MdA").to_string();

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
                                telnet_user = u.to_string();
                            }
                        }
                        if let Some(p) = obj.get("TelnetPassword").and_then(|v| v.as_str()) {
                            if !p.is_empty() {
                                telnet_pass = p.to_string();
                            }
                        }
                        steps.push(format!(
                            "✅ [1/3] 免密读取光猫服务配置成功！Telnet 账号: {}, 密码: {}",
                            telnet_user, telnet_pass
                        ));
                    }
                }
            }
        }

        if steps.is_empty() {
            steps.push(format!(
                "ℹ️ [1/3] 读取服务配置未直接返回，使用预设凭据: {} / {}",
                telnet_user, telnet_pass
            ));
        }

        // Step 2: Post /setObjs to enable Telnet
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
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            .header("X-Requested-With", "XMLHttpRequest")
            .body(set_payload.to_string())
            .send()
            .await
            .map_err(|e| format!("请求 /setObjs 失败: {}", e))?;

        let status = set_res.status();
        let resp_text = set_res.text().await.unwrap_or_default();
        steps.push(format!(
            "✅ [2/3] 提交 /setObjs 开启指令成功 (HTTP {}{})",
            status.as_u16(),
            if resp_text.is_empty() { "".to_string() } else { format!(": {}", resp_text) }
        ));

        // Step 3: Probe port 23
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
                telnet_user: Some(telnet_user),
                telnet_pass: Some(telnet_pass),
                steps,
                message: format!("🎉 Telnet 一键开启成功！({}:23 已就绪)", self.ip),
            })
        } else {
            steps.push(format!("❌ [3/3] 指令已发送，但 {}:23 端口暂未响应", self.ip));
            Ok(EnableTelnetResult {
                success: false,
                port_open: false,
                telnet_user: Some(telnet_user),
                telnet_pass: Some(telnet_pass),
                steps,
                message: "已向光猫发送开启指令，但 23 端口尚未开放，请稍等 3 秒后再试一次".to_string(),
            })
        }
    }
}
