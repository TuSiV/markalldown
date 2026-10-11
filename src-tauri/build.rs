fn main() {
    println!("cargo:rustc-env=MARKALLDOWN_TARGET={}", std::env::var("TARGET").expect("TARGET missing"));
    tauri_build::build()
}
