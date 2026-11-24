use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{Duration, timeout};

const SENTINEL_START: &str = "__MB_S__";
const SENTINEL_END: &str = "__MB_E__";

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

    async fn read_until_any(
        &mut self,
        patterns: &[&str],
        timeout_secs: u64,
    ) -> Result<String, String> {
        let mut buf = vec![0u8; 4096];
        let mut accumulated = String::new();

        let res = timeout(Duration::from_secs(timeout_secs), async {
            loop {
                let n = self
                    .stream
                    .read(&mut buf)
                    .await
                    .map_err(|e| e.to_string())?;
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

    async fn read_until_sentinel_and_prompt(
        &mut self,
        timeout_secs: u64,
    ) -> Result<String, String> {
        let mut buf = vec![0u8; 4096];
        let mut accumulated = String::new();
        let prompt = self.prompt.clone();

        let res = timeout(Duration::from_secs(timeout_secs), async {
            loop {
                let n = self
                    .stream
                    .read(&mut buf)
                    .await
                    .map_err(|e| e.to_string())?;
                if n == 0 {
                    return Err("对端关闭了连接".to_string());
                }
                let chunk = String::from_utf8_lossy(&buf[..n]);
                accumulated.push_str(&chunk);

                if let Some(end_idx) = accumulated.find(SENTINEL_END) {
                    let after_end = &accumulated[end_idx + SENTINEL_END.len()..];
                    if after_end.contains(&prompt)
                        || after_end.ends_with("$ ")
                        || after_end.ends_with("# ")
                        || after_end.ends_with("> ")
                    {
                        return Ok(accumulated.clone());
                    }
                }
            }
        })
        .await;

        match res {
            Ok(inner) => inner,
            Err(_) => Err(format!("命令执行超时，已接收内容: {}", accumulated)),
        }
    }

    async fn handshake(&mut self, user: &str, pass: &str) -> Result<(), String> {
        // 1. Wait for Login prompt
        self.read_until_any(&["Login:", "login:", "Username:"], 5)
            .await?;
        self.stream
            .write_all(format!("{}\r\n", user).as_bytes())
            .await
            .map_err(|e| format!("发送用户名失败: {}", e))?;

        // 2. Wait for Password prompt
        self.read_until_any(&["Password:", "password:"], 5).await?;
        self.stream
            .write_all(format!("{}\r\n", pass).as_bytes())
            .await
            .map_err(|e| format!("发送密码失败: {}", e))?;

        // 3. Wait for Shell prompt or fast auth error
        let out = self
            .read_until_any(
                &[
                    "/ $ ",
                    "# ",
                    "> ",
                    "$ ",
                    "Login incorrect",
                    "login incorrect",
                    "Authentication failed",
                ],
                8,
            )
            .await?;

        let lower = out.to_ascii_lowercase();
        if lower.contains("incorrect") || lower.contains("authentication failed") {
            return Err("Telnet 认证失败：账号或密码不正确".to_string());
        }

        if out.contains("/ $ ") {
            self.prompt = "/ $ ".to_string();
        } else if out.contains("# ") {
            self.prompt = "# ".to_string();
        } else if out.contains("$ ") {
            self.prompt = "$ ".to_string();
        } else if out.contains("> ") {
            self.prompt = "> ".to_string();
        }

        Ok(())
    }

    /// Execute a command in the shell and return clean stdout without echo wrapping artifacts
    pub async fn exec(&mut self, cmd: &str) -> Result<String, String> {
        let trimmed = cmd.trim();
        if trimmed.is_empty() {
            return Ok(String::new());
        }

        let formatted = build_framed_command(trimmed);
        self.stream
            .write_all(formatted.as_bytes())
            .await
            .map_err(|e| format!("发送指令 '{}' 失败: {}", trimmed, e))?;

        let raw_out = self.read_until_sentinel_and_prompt(12).await?;
        Ok(extract_between_sentinels(&raw_out))
    }
}

fn build_framed_command(cmd: &str) -> String {
    let cleaned = cmd.trim().trim_end_matches(';').trim_end();
    let sep = if cleaned.ends_with('&') { " " } else { "; " };
    format!(
        "printf '__MB_%s__\\n' S; {}{}printf '__MB_%s__\\n' E\r\n",
        cleaned, sep
    )
}

fn extract_between_sentinels(raw_out: &str) -> String {
    let normalized = raw_out.replace("\r\n", "\n").replace('\r', "");
    let lines: Vec<&str> = normalized.lines().collect();

    let start_pos = lines.iter().position(|l| l.trim() == SENTINEL_START);
    let end_pos = lines.iter().rposition(|l| l.trim() == SENTINEL_END);

    if let (Some(s), Some(e)) = (start_pos, end_pos) {
        if e > s {
            return lines[s + 1..e].join("\n").trim().to_string();
        }
        return String::new();
    }

    // Fallback: strip first line (echo) and last line (prompt)
    if lines.len() > 2 {
        lines[1..lines.len() - 1].join("\n").trim().to_string()
    } else {
        normalized.trim().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{build_framed_command, extract_between_sentinels};

    #[test]
    fn test_framed_command_normal_and_background() {
        let normal = build_framed_command("uname -r");
        assert!(normal.contains("uname -r; printf '__MB_%s__\\n' E"));

        let bg = build_framed_command("java -jar felix.jar >/tmp/.null 2>&1 &");
        assert!(bg.contains("& printf '__MB_%s__\\n' E"));
        assert!(!bg.contains("&;"));
    }

    #[test]
    fn test_extract_ignores_wrapped_echo() {
        let raw = "printf '__MB_%s__\\n' S; grep -E '(very_long_command_line\r\n_wrapped_here)' /config/work/lastgood.xml; printf '__MB_%s__\\n' E\r\n__MB_S__\r\nline1\r\nline2\r\n__MB_E__\r\n/ $ ";
        assert_eq!(extract_between_sentinels(raw), "line1\nline2");
    }

    #[test]
    fn test_extract_empty_output() {
        let raw = "printf '__MB_%s__\\n' S; killall -9 java; printf '__MB_%s__\\n' E\r\n__MB_S__\r\n__MB_E__\r\n/ $ ";
        assert_eq!(extract_between_sentinels(raw), "");
    }
}
