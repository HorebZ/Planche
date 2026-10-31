use super::*;

#[test]
fn domain_id_serializes_as_bare_string() {
    let id = ItemId("PVTI_lADOAq5TD84Bm1t2zgXyZ".into());
    let json = serde_json::to_string(&id).unwrap();

    assert_eq!(json, r#""PVTI_lADOAq5TD84Bm1t2zgXyZ""#);
    assert_eq!(serde_json::from_str::<ItemId>(&json).unwrap(), id);
}
