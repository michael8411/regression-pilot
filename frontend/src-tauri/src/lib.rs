#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn auth_token_path() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("TESTDECK_DATA_DIR") {
        return std::path::PathBuf::from(dir)
            .join("runtime")
            .join("backend-auth-token");
    }
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    std::path::PathBuf::from(appdata)
        .join("Testdeck")
        .join("runtime")
        .join("backend-auth-token")
}

#[cfg(target_os = "macos")]
fn auth_token_path() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("TESTDECK_DATA_DIR") {
        return std::path::PathBuf::from(dir)
            .join("runtime")
            .join("backend-auth-token");
    }
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("Testdeck")
        .join("runtime")
        .join("backend-auth-token")
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn auth_token_path() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("TESTDECK_DATA_DIR") {
        return std::path::PathBuf::from(dir)
            .join("runtime")
            .join("backend-auth-token");
    }
    let xdg = std::env::var("XDG_CONFIG_HOME").unwrap_or_else(|_| {
        format!(
            "{}/.config",
            std::env::var("HOME").unwrap_or_default()
        )
    });
    std::path::PathBuf::from(xdg)
        .join("testdeck")
        .join("runtime")
        .join("backend-auth-token")
}

/// Read the per-launch backend auth token from the runtime file.
/// Returns Err("token_unavailable") when the backend has not started yet.
#[tauri::command]
fn get_backend_auth_token() -> Result<String, String> {
    std::fs::read_to_string(auth_token_path())
        .map(|s| s.trim().to_string())
        .map_err(|_| "token_unavailable".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_backend_auth_token])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
