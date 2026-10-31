use planche_core::github::ops::{decode_project_items, decode_project_meta};
use serde_json::json;

use super::*;

fn core_with_fixtures(name: &str) -> (Core, ProjectId) {
    let dir = std::env::temp_dir().join(format!("planche-app-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let mut cache = Cache::open(dir.join("cache.sqlite")).unwrap();
    let meta = decode_project_meta(include_str!(
        "../../../crates/planche-core/src/github/_fixtures/project_meta.json"
    ))
    .unwrap();
    let items: Vec<_> = [
        include_str!("../../../crates/planche-core/src/github/_fixtures/project_items_page1.json"),
        include_str!("../../../crates/planche-core/src/github/_fixtures/project_items_page2.json"),
    ]
    .iter()
    .flat_map(|page| decode_project_items(page).unwrap().items)
    .collect();

    cache.write_snapshot(&meta, &items, true).unwrap();

    (Core::new(cache), meta.id)
}

#[tokio::test]
async fn network_commands_require_an_unlocked_session() {
    let (core, _) = core_with_fixtures("locked-session");

    core.cache().set("account_login", "cached-account").unwrap();
    core.cache().set("account_id", "U_cached").unwrap();

    for _ in 0..3 {
        assert!(matches!(
            core.client(),
            Err(AppError {
                kind: ErrorKind::Auth,
                ..
            })
        ));
        assert!(core.engine().await.is_none());
    }

    *core.token.lock().unwrap() = Some("test-token".into());

    assert!(core.client().is_ok());

    core.stop().await;

    assert!(matches!(
        core.client(),
        Err(AppError {
            kind: ErrorKind::Auth,
            ..
        })
    ));
    assert!(core.engine().await.is_none());
}

#[test]
fn dispatch_receipt_survives_reopening_and_rejects_missing_project() {
    let (core, project) = core_with_fixtures("receipt");
    let intent = Intent::CreateDraft {
        project_id: project.clone(),
        item_id: planche_core::domain::ItemId("draft:receipt".into()),
        field_id: core.board(&project, None).unwrap().unwrap().field.id,
        column: None,
        title: "Durable draft".into(),
    };

    let DispatchOutcome::Accepted { seq } = core.dispatch_intent(&intent) else {
        panic!("enqueue should commit");
    };

    let mut invalid = intent.clone();

    if let Intent::CreateDraft { project_id, .. } = &mut invalid {
        *project_id = ProjectId("PVT_missing".into());
    }

    assert!(matches!(
        core.dispatch_intent(&invalid),
        DispatchOutcome::Rejected {
            error: AppError {
                kind: ErrorKind::Cache,
                ..
            }
        }
    ));

    drop(core);

    let path = std::env::temp_dir().join(format!(
        "planche-app-{}-receipt/cache.sqlite",
        std::process::id()
    ));
    let reopened = Cache::open(path).unwrap();

    assert_eq!(reopened.intents(&project).unwrap(), vec![intent.clone()]);
    assert!(reopened.intents(invalid.project_id()).unwrap().is_empty());

    let row = reopened.claim_next(&project).unwrap().unwrap();

    assert_eq!(row.seq, seq);
    assert_eq!(row.intent, intent);
    assert!(reopened.claim_next(&project).unwrap().is_none());
}

#[test]
fn get_board_reads_the_cached_board() {
    let (core, project) = core_with_fixtures("board");
    let board = serde_json::to_value(core.board(&project, None).unwrap().unwrap()).unwrap();
    let columns: Vec<_> = board["columns"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            let numbers: Vec<_> = c["cards"]
                .as_array()
                .unwrap()
                .iter()
                .map(|card| card["number"].clone())
                .collect();

            json!([c["name"], numbers])
        })
        .collect();

    assert_eq!(
        json!(columns),
        json!([
            ["Todo", [4, 5, 6, 7, 8, 9, 10, 11]],
            ["In Progress", [1]],
            ["Done", [2, 3, 13]]
        ])
    );
    assert_eq!(
        board["columns"][0]["cards"][0],
        json!({
            "item_id": "PVTI_lAHOAq5TD84Bm1t2zhAbQRY",
            "position": 3,
            "kind": "issue",
            "id": "I_kwDOVF-zOM8AAAABWrzxHQ",
            "number": 4,
            "title": "Phase 1b: show a project board in the terminal",
            "url": "https://github.com/HorebZ/Planche/issues/4",
            "repo": "HorebZ/Planche",
            "state": "open",
            "assignees": [],
            "labels": [{ "name": "phase", "color": "1D76DB" }],
            "details": planche_core::domain::CardDetails::default(),
            "pending": false,
            "updated_by_sync": false
        })
    );
    assert_eq!(board["pending_count"], json!(0));
    assert!(board["synced_at"].is_string());
}

#[test]
fn get_board_picks_a_view_by_id() {
    let (core, project) = core_with_fixtures("view");
    let meta = core.project(&project).unwrap().unwrap();
    let board_view = meta.views.iter().find(|v| v.number == 2).unwrap();
    let board = core.board(&project, Some(&board_view.id)).unwrap().unwrap();

    assert_eq!(board.view.unwrap().number, 2);
}

#[test]
fn get_board_is_none_before_the_first_sync() {
    let (core, _) = core_with_fixtures("none");

    assert!(
        core.board(&ProjectId("PVT_unknown".into()), None)
            .unwrap()
            .is_none()
    );
}
