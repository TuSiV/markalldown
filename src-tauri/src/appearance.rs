#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAppearance {
    platform: &'static str,
    reduce_transparency: bool,
    increase_contrast: bool,
    reduce_motion: bool,
}

#[tauri::command]
pub fn get_desktop_appearance() -> DesktopAppearance {
    #[cfg(target_os = "macos")]
    {
        let workspace = objc2_app_kit::NSWorkspace::sharedWorkspace();
        DesktopAppearance {
            platform: "macos",
            reduce_transparency: workspace.accessibilityDisplayShouldReduceTransparency(),
            increase_contrast: workspace.accessibilityDisplayShouldIncreaseContrast(),
            reduce_motion: workspace.accessibilityDisplayShouldReduceMotion(),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        DesktopAppearance {
            platform: std::env::consts::OS,
            reduce_transparency: true,
            increase_contrast: false,
            reduce_motion: false,
        }
    }
}
