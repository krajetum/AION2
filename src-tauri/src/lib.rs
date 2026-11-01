mod crash;
mod armory;
mod links;
mod meter;
mod places;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin: a second launch exits and brings the running window to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(meter::MeterState::default())
        .invoke_handler(tauri::generate_handler![
            meter::meter_start,
            meter::meter_reset,
            meter::meter_pause,
            meter::meter_target_mode,
            meter::meter_party_only,
            meter::meter_watch,
            meter::meter_view,
            meter::meter_reconnect,
            meter::meter_overlay,
            meter::meter_overlay_hide,
            meter::meter_idle,
            meter::events_overlay,
            meter::overlay_style,
            meter::overlay_opacity,
            meter::recorder_start,
            meter::recorder_mark,
            meter::recorder_stop,
            meter::recorder_status,
            meter::cube_popup,
            meter::radar_overlay,
            meter::net_overlay,
            crash::crash_log,
            links::open_url,
            armory::armory_get,
            meter::meter_cube_codes,
        ])
        .setup(|app| {
            crash::install(app.handle());
            places::load(app.handle());
            let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let mute = MenuItem::with_id(app, "mute", "Mute for 1 hour", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &mute, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("AION 2 Companion")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main(app),
                    // Mute state lives in the frontend data: notify it with an event.
                    "mute" => {
                        let _ = app.emit("tray-mute", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = e
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window = hiding it to the tray (the overlay just closes).
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
