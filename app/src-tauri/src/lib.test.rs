/// `bun run check` runs this, then fails if `bindings.types.ts` changed.
#[test]
fn export_typescript_bindings() {
    super::export_bindings(&super::builder());
}
