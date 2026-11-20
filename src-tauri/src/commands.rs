use tauri::command;
use crate::web_client::{WebClient, EnableTelnetResult};
use crate::telnet_client::TelnetClient;
use crate::modem_manager::{ModemManager, SystemInfo, Credentials, SurveillanceStatus};

#[command]
pub async fn enable_telnet(
    ip: String,
    web_user: String,
    web_pass: String,
) -> Result<EnableTelnetResult, String> {
    let client = WebClient::new(&ip);
    client.enable_telnet_via_web(&web_user, &web_pass).await
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
    ModemManager::get_system_info(&mut client).await
}

#[command]
pub async fn get_credentials(ip: String, user: String, pass: String) -> Result<Credentials, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    ModemManager::get_credentials(&mut client).await
}

#[command]
pub async fn check_surveillance(ip: String, user: String, pass: String) -> Result<SurveillanceStatus, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    ModemManager::check_surveillance(&mut client).await
}

#[command]
pub async fn kill_surveillance(ip: String, user: String, pass: String) -> Result<String, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    ModemManager::kill_surveillance(&mut client).await
}

#[command]
pub async fn exec_shell_cmd(ip: String, user: String, pass: String, cmd: String) -> Result<String, String> {
    let mut client = TelnetClient::connect(&ip, 23, &user, &pass).await?;
    client.exec(&cmd).await
}
