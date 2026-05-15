pub mod categorization;
pub mod commands;
pub mod db;
pub mod embeddings;
pub mod error;
pub mod export;
pub mod ingest;
pub mod memory;
pub mod ocr;
pub mod pdf;
pub mod retrieval;
pub mod search;
pub mod websearch;

use tauri::Manager;
use db::{DbState, DbPathState};
use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_dir)?;
            let (conn, db_path) = db::open(&app_dir)?;
            app.manage(DbState(std::sync::Mutex::new(conn)));
            app.manage(DbPathState(db_path));
/*            let voice_dir = app_dir.join("voice");
            std::fs::create_dir_all(&voice_dir)?;
            app.manage(VoiceState::default_for_app_data(voice_dir));*/
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_chats,
            create_chat,
            update_chat_title,
            touch_chat,
            pin_chat,
            archive_chat,
            delete_chat,
            get_messages,
            save_message,
            update_message_content,
            list_documents,
            ingest_pdf,
            retrieve_chunks,
            extract_memory,
            get_relevant_memory,
            list_memory_facts,
            update_memory_fact,
            delete_memory_fact,
            global_search,
            list_categories,
            create_category,
            delete_category,
            assign_chat_category,
            suggest_chat_category,
            get_graph,
            export_chat_markdown,
            export_chat_json,
            backup_database,
            get_all_settings,
            set_setting,
            check_tesseract,
            web_search,
            get_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
