use tauri::command;

use crate::modem_manager::{Credentials, ModemManager, SurveillanceStatus, SystemInfo};
use crate::telnet_client::TelnetClient;
use crate::web_client::{AutoDetectResult, EnableTelnetResult, WebClient};

#[command]
pub async fn auto_detect_telnet(ip: Option<String>) -> Result<AutoDetectResult, String> {
    let target_ip = ip.unwrap_or_else(|| "192.168.1.1".to_string());
    let client = WebClient::new(&target_ip);
    client.auto_detect_and_enable().await
}

#[command]
pub async fn enable_telnet(
    ip: String,
    user: Option<String>,
    pass: Option<String>,
) -> Result<EnableTelnetResult, String> {
    let client = WebClient::new(&ip);
    client
        .enable_telnet_direct(user.as_deref(), pass.as_deref())
        .await
}

#[command]
pub async fn test_telnet(ip: String, user: String, pass: String) -> Result<String, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    let uname = client.exec("uname -a").await?;
    Ok(format!("Telnet 连通成功！内核: {}", uname))
}

#[command]
pub async fn get_system_info(ip: String, user: String, pass: String) -> Result<SystemInfo, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    let web = WebClient::new(&ip);
    ModemManager::get_system_info(&mut client, &web).await
}

#[command]
pub async fn get_credentials(
    ip: String,
    user: String,
    pass: String,
) -> Result<Credentials, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    let web = WebClient::new(&ip);
    ModemManager::get_credentials(&mut client, &web).await
}

#[command]
pub async fn check_surveillance(
    ip: String,
    user: String,
    pass: String,
) -> Result<SurveillanceStatus, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    let web = WebClient::new(&ip);
    ModemManager::check_surveillance(&mut client, &web).await
}

#[command]
pub async fn kill_surveillance(ip: String, user: String, pass: String) -> Result<String, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    let web = WebClient::new(&ip);
    ModemManager::kill_surveillance(&mut client, &web).await
}

#[command]
pub async fn restore_surveillance(
    ip: String,
    user: String,
    pass: String,
) -> Result<String, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    let web = WebClient::new(&ip);
    ModemManager::restore_surveillance(&mut client, &web).await
}

#[command]
pub async fn set_ftp_enabled(ip: String, enable: bool) -> Result<String, String> {
    let web = WebClient::new(&ip);
    web.set_ftp_enabled(enable).await
}

#[command]
pub async fn set_lan_ipv6_enabled(ip: String, enable: bool) -> Result<String, String> {
    let web = WebClient::new(&ip);
    web.set_lan_ipv6_enabled(enable).await
}

#[command]
pub async fn exec_shell_cmd(
    ip: String,
    user: String,
    pass: String,
    cmd: String,
) -> Result<String, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    client.exec(&cmd).await
}
