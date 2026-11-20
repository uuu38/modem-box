pub mod web_client;
pub mod telnet_client;
pub mod modem_manager;
pub mod commands;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            auto_detect_telnet,
            enable_telnet,
            test_telnet,
            get_system_info,
            get_credentials,
            check_surveillance,
            kill_surveillance,
            exec_shell_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
