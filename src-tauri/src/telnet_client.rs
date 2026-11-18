use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

pub struct TelnetClient {
    stream: TcpStream,
    prompt: String,
}

impl TelnetClient {
    /// Connect to modem Telnet port and automatically authenticate
    pub async fn connect(ip: &str, port: u16, user: &str, pass: &str) -> Result<Self, String> {
        let addr = format!("{}:{}", ip, port);
        let stream = timeout(Duration::from_secs(5), TcpStream::connect(&addr))
            .await
            .map_err(|_| format!("连接 {} 超时，请确认光猫 IP 正确且 Telnet 已开启", addr))?
            .map_err(|e| format!("连接 {} 失败: {}", addr, e))?;

        let mut client = Self {
            stream,
            prompt: "/ $ ".to_string(),
        };

        // Complete Telnet login handshake
        client.handshake(user, pass).await?;

        Ok(client)
    }

    async fn read_until_any(&mut self, patterns: &[&str], timeout_secs: u64) -> Result<String, String> {
        let mut buf = vec![0u8; 4096];
        let mut accumulated = String::new();

        let res = timeout(Duration::from_secs(timeout_secs), async {
            loop {
                let n = self.stream.read(&mut buf).await.map_err(|e| e.to_string())?;
                if n == 0 {
                    return Err("对端关闭了连接".to_string());
                }
                let chunk = String::from_utf8_lossy(&buf[..n]);
                accumulated.push_str(&chunk);

                for p in patterns {
                    if accumulated.contains(p) {
                        return Ok(accumulated.clone());
                    }
                }
            }
        })
        .await;

        match res {
            Ok(inner) => inner,
            Err(_) => Err(format!("等待提示符超时，已接收内容: {}", accumulated)),
        }
    }

    async fn handshake(&mut self, user: &str, pass: &str) -> Result<(), String> {
        // 1. Wait for Login prompt
        self.read_until_any(&["Login:", "login:", "Username:"], 5).await?;
        self.stream.write_all(format!("{}\r\n", user).as_bytes()).await
            .map_err(|e| format!("发送用户名失败: {}", e))?;

        // 2. Wait for Password prompt
        self.read_until_any(&["Password:", "password:"], 5).await?;
        self.stream.write_all(format!("{}\r\n", pass).as_bytes()).await
            .map_err(|e| format!("发送密码失败: {}", e))?;

        // 3. Wait for Shell prompt
        let out = self.read_until_any(&["/ $ ", "# ", "> ", "$ "], 8).await?;
        if out.contains("/ $ ") {
            self.prompt = "/ $ ".to_string();
        } else if out.contains("# ") {
            self.prompt = "# ".to_string();
        }

        Ok(())
    }

    /// Execute a command in the shell and return trimmed output
    pub async fn exec(&mut self, cmd: &str) -> Result<String, String> {
        let formatted = format!("{}\r\n", cmd);
        self.stream.write_all(formatted.as_bytes()).await
            .map_err(|e| format!("发送指令 '{}' 失败: {}", cmd, e))?;

        let prompt = self.prompt.clone();
        let raw_out = self.read_until_any(&[&prompt], 10).await?;

        // Clean up command echo and prompt
        let lines: Vec<&str> = raw_out.lines().collect();
        let clean = if lines.len() > 1 {
            // Drop first line (echo of cmd) and last line (prompt)
            lines[1..lines.len() - 1].join("\n")
        } else {
            raw_out
        };

        Ok(clean.trim().to_string())
    }
}
