import { useState } from "react";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Row, Section, State } from "../kit";

export function MarkdownEditorSection() {
  return (
    <Section
      id="markdown-editor"
      title="Markdown editor"
    >
      {() => (
        <Row label="write, format and preview">
          {(["empty", "ready", "disabled"] as const).map((state) => (
            <State
              key={state}
              label={state}
              className="w-full"
            >
              <EditorPreview state={state} />
            </State>
          ))}
        </Row>
      )}
    </Section>
  );
}

function EditorPreview({ state }: { state: "empty" | "ready" | "disabled" }) {
  const [value, setValue] = useState(
    state === "empty"
      ? ""
      : "### Release notes\n\nReady for **review**. ~~Old wording~~.\n\n- [x] Keep drafts\n- [ ] Preview before sending",
  );

  return (
    <MarkdownEditor
      className="w-full"
      label="Markdown"
      value={value}
      onChange={setValue}
      disabled={state === "disabled"}
      placeholder="Write in Markdown…"
      onOpenLink={() => {}}
    />
  );
}
