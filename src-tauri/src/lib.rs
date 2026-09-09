#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                match tauri_plugin_updater::Builder::new().build() {
                    Ok(plugin) => {
                        if let Err(error) = app.handle().plugin(plugin) {
                            eprintln!("Datart: updater plugin disabled (registration failed): {error}");
                        }
                    }
                    Err(error) => {
                        eprintln!("Datart: updater plugin disabled (build failed): {error}");
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while running Datart: {error}"));
}
