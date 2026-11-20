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
            .cookie_store(true)
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

    /// Full flow:
    /// 1. GET /getChallengeStr -> obtain challenge string
    /// 2. Compute MD5(challenge + ":" + web_pass)
    /// 3. GET /lgDevice?userName=...&responseChallenge=... -> obtain session cookie
    /// 4. GET /entelnet.cgi (with session cookie) -> start telnetd
    /// 5. Probe TCP port 23 to verify telnetd is actually listening
    pub async fn enable_telnet_via_web(
        &self,
        web_user: &str,
        web_pass: &str,
    ) -> Result<EnableTelnetResult, String> {
        let mut steps = Vec::new();

        if web_user.trim().is_empty() || web_pass.trim().is_empty() {
            return Err("请输入光猫 Web 用户名和密码（光猫背面标签的普通用户密码）".to_string());
        }

        // Step 1: Request challenge string
        let challenge_url = format!("{}/getChallengeStr", self.base_url);
        let challenge_resp = self
            .client
            .get(&challenge_url)
            .send()
            .await
            .map_err(|e| format!("无法连接光猫 Web ({}): {}", self.base_url, e))?;

        let challenge_text = challenge_resp
            .text()
            .await
            .map_err(|e| format!("读取 /getChallengeStr 响应失败: {}", e))?;

        let challenge_json: Value = serde_json::from_str(&challenge_text)
            .map_err(|e| format!("解析 /getChallengeStr JSON 失败: {} (原始响应: {})", e, challenge_text))?;

        let challenge = match challenge_json.get("challenge").and_then(|v| v.as_str()) {
            Some(c) if !c.is_empty() => c.to_string(),
            _ => {
                let err_code = challenge_json.get("errorCode").and_then(|v| v.as_i64()).unwrap_or(-1);
                let msg = match err_code {
                    1 => "其他设备已经登录光猫后台，请先在浏览器退出或等待超时后重试".to_string(),
                    5 => {
                        let remain = challenge_json
                            .get("nextLogRemainSec")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(60);
                        format!("密码试错次数过多，请等待 {} 秒后重试", remain)
                    }
                    _ => format!("获取登录 Challenge 失败 (errorCode={}): {}", err_code, challenge_text),
                };
                return Err(msg);
            }
        };
        steps.push(format!("✅ [1/4] 获取 Challenge 成功 ({}...)", &challenge[..challenge.len().min(8)]));

        // Step 2: Compute MD5(challenge + ":" + password) & login via /lgDevice
        let response_challenge = md5_hex(&format!("{}:{}", challenge, web_pass));
        let login_url = format!("{}/lgDevice", self.base_url);

        let mut query_params: Vec<(&str, &str)> = vec![
            ("userName", web_user),
            ("responseChallenge", &response_challenge),
        ];
        if web_pass.contains('+') || web_pass.len() == 32 || web_user.contains("daemon") {
            query_params.push(("data", web_pass));
        }

        let login_resp = self
            .client
            .get(&login_url)
            .query(&query_params)
            .send()
            .await
            .map_err(|e| format!("请求 /lgDevice 登录失败: {}", e))?;

        let login_text = login_resp
            .text()
            .await
            .map_err(|e| format!("读取 /lgDevice 响应失败: {}", e))?;

        let login_json: Value = serde_json::from_str(&login_text)
            .map_err(|e| format!("解析 /lgDevice JSON 失败: {} (原始响应: {})", e, login_text))?;

        let err_code = login_json.get("errorCode").and_then(|v| v.as_i64()).unwrap_or(-1);
        if err_code != 0 {
            let msg = match err_code {
                1 => {
                    if let Some(cnt) = login_json.get("lgErrCnt").and_then(|v| v.as_i64()) {
                        let remain = (3 - cnt).max(0);
                        if remain == 0 {
                            "用户名或密码错误！已达 3 次上限，请 60 秒后重试".to_string()
                        } else {
                            format!("用户名或密码错误！还剩 {} 次尝试机会", remain)
                        }
                    } else {
                        "用户名或密码错误！请核对光猫背面密码".to_string()
                    }
                }
                2 => "已有其他设备登录光猫后台，请先退出浏览器会话后重试".to_string(),
                _ => format!("Web 登录失败 (errorCode={}): {}", err_code, login_text),
            };
            return Err(msg);
        }
        steps.push(format!("✅ [2/4] Web 鉴权登录成功 (用户: {})，已获取 Session Cookie", web_user));

        // Step 3: Trigger /entelnet.cgi with authenticated session cookie
        let entelnet_url = format!("{}/entelnet.cgi", self.base_url);
        let entelnet_resp = self
            .client
            .get(&entelnet_url)
            .send()
            .await
            .map_err(|e| format!("请求 /entelnet.cgi 失败: {}", e))?;

        let status_code = entelnet_resp.status();
        let entelnet_text = entelnet_resp.text().await.unwrap_or_default();
        if !status_code.is_success() {
            return Err(format!(
                "/entelnet.cgi 返回异常状态码 {}: {}",
                status_code, entelnet_text
            ));
        }
        steps.push(format!(
            "✅ [3/4] 已携带 Cookie 触发 /entelnet.cgi (响应: {})",
            entelnet_text.trim().replace(['\r', '\n', '\t'], " ")
        ));

        // Step 4: Verify TCP port 23 is actually open (retry up to 3 times)
        let mut port_open = false;
        for _ in 0..3 {
            if self.check_telnet_port().await {
                port_open = true;
                break;
            }
            sleep(Duration::from_millis(500)).await;
        }

        if port_open {
            steps.push(format!("✅ [4/4] 实测 {}:23 端口已开放！Telnet 开启成功！", self.ip));
            Ok(EnableTelnetResult {
                success: true,
                port_open: true,
                steps,
                message: format!("🎉 Telnet 一键开启成功！({}:23 已连通)", self.ip),
            })
        } else {
            steps.push(format!("❌ [4/4] 已触发 /entelnet.cgi，但 {}:23 端口仍未开放", self.ip));
            Ok(EnableTelnetResult {
                success: false,
                port_open: false,
                steps,
                message: "已登录并请求 /entelnet.cgi，但 23 端口未检测到监听，请检查光猫型号或尝试超管密码".to_string(),
            })
        }
    }
}

/// Pure Rust RFC 1321 MD5 hex digest (zero external dependencies)
fn md5_hex(input: &str) -> String {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const K: [u32; 64] = [
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
        0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
        0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
        0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
        0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
        0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
        0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
        0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
        0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
        0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
        0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
        0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
        0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
        0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
        0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
    ];

    let bytes = input.as_bytes();
    let bit_len = (bytes.len() as u64).wrapping_mul(8);
    let mut msg = bytes.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0x00);
    }
    msg.extend_from_slice(&bit_len.to_le_bytes());

    let mut a0: u32 = 0x67452301;
    let mut b0: u32 = 0xefcdab89;
    let mut c0: u32 = 0x98badcfe;
    let mut d0: u32 = 0x10325476;

    for chunk in msg.chunks_exact(64) {
        let mut m = [0u32; 16];
        for i in 0..16 {
            m[i] = u32::from_le_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }

        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);
        for i in 0..64 {
            let (f, g) = match i {
                0..=15 => ((b & c) | ((!b) & d), i),
                16..=31 => ((d & b) | ((!d) & c), (5 * i + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * i + 5) % 16),
                _ => (c ^ (b | (!d)), (7 * i) % 16),
            };
            let temp = d;
            d = c;
            c = b;
            let sum = a.wrapping_add(f).wrapping_add(K[i]).wrapping_add(m[g]);
            b = b.wrapping_add(sum.rotate_left(S[i]));
            a = temp;
        }

        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }

    let mut digest = [0u8; 16];
    digest[0..4].copy_from_slice(&a0.to_le_bytes());
    digest[4..8].copy_from_slice(&b0.to_le_bytes());
    digest[8..12].copy_from_slice(&c0.to_le_bytes());
    digest[12..16].copy_from_slice(&d0.to_le_bytes());

    digest.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::md5_hex;

    #[test]
    fn test_md5_vectors() {
        assert_eq!(md5_hex(""), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(md5_hex("abc"), "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(
            md5_hex("message digest"),
            "f96b697d7cb7938d525a2f31aaf161d0"
        );
    }
}
