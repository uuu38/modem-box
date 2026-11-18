use reqwest::Client;
use std::time::Duration;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebResult {
    pub success: bool,
    pub message: String,
}

pub struct WebClient {
    client: Client,
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
            base_url: format!("http://{}", ip),
        }
    }

    /// Check if web interface is reachable
    pub async fn ping(&self) -> bool {
        self.client.get(&format!("{}/", self.base_url))
            .send()
            .await
            .map(|r| r.status().is_success() || r.status().is_redirection())
            .unwrap_or(false)
    }

    /// Attempt to trigger telnet opening via /entelnet.cgi
    pub async fn trigger_entelnet_cgi(&self) -> Result<String, String> {
        let url = format!("{}/entelnet.cgi", self.base_url);
        
        // Try GET request first
        let get_res = self.client.get(&url).send().await;
        if let Ok(resp) = get_res {
            if resp.status().is_success() {
                return Ok("成功触发 /entelnet.cgi (GET)".to_string());
            }
        }

        // Try POST with enable parameter
        let post_res = self.client.post(&url)
            .form(&[("enable", "1"), ("TelnetEnable", "1")])
            .send()
            .await
            .map_err(|e| format!("请求 entelnet.cgi 失败: {}", e))?;

        let text = post_res.text().await.unwrap_or_default();
        Ok(format!("entelnet.cgi 返回响应 (长度: {} 字节)", text.len()))
    }
}
