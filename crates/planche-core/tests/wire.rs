use planche_core::github::ops::{decode_project_items, decode_project_meta};
use serde_json::{Value, json};

fn fixture(name: &str) -> String {
    let path = format!("{}/../../fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"))
}

#[test]
fn every_fixture_decodes() {
    let meta = decode_project_meta(&fixture("project_meta.json")).unwrap();
    assert_eq!(meta.title, "Planche");
    assert!(
        meta.fields
            .iter()
            .any(|f| f.name == "Status" && f.options.is_some())
    );

    let page1 = decode_project_items(&fixture("project_items_page1.json")).unwrap();
    let page2 = decode_project_items(&fixture("project_items_page2.json")).unwrap();
    assert!(page1.next_cursor.is_some());
    assert!(page2.next_cursor.is_none());
    assert!(!page1.items.is_empty() && !page2.items.is_empty());
}

#[test]
fn unknown_field_value_typename_is_ignored() {
    let mut page: Value = serde_json::from_str(&fixture("project_items_page1.json")).unwrap();
    let values = page["data"]["node"]["items"]["nodes"][0]["fieldValues"]["nodes"]
        .as_array_mut()
        .unwrap();
    values.push(json!({ "__typename": "ProjectV2ItemFieldFromTheFuture", "whatever": 1 }));
    let decoded = decode_project_items(&page.to_string()).unwrap();
    assert!(!decoded.items[0].single_selects.is_empty());
}
