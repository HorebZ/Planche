import { Search } from "lucide-react";
import { useId } from "react";
import { Checkbox, CheckMark } from "@/components/ui/checkbox";
import { Field, FieldMessage, Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Row, Section, State } from "../kit";

const intervals = [
  { value: "1", label: "1 min" },
  { value: "5", label: "5 min" },
  { value: "15", label: "15 min" },
  { value: "manual", label: "Manual" },
] as const;

function TokenErrorPreview() {
  const id = useId();
  return (
    <Field className="w-72">
      <label htmlFor={id}>Personal access token</label>
      <Input
        id={id}
        aria-describedby={`${id}-error`}
        className="w-full"
        invalid
        mono
        defaultValue="ghp_xxxx"
      />
      <FieldMessage
        id={`${id}-error`}
        role="alert"
      >
        Token rejected (401). Check that it hasn't expired.
      </FieldMessage>
    </Field>
  );
}

function IntervalGroup({ preview, disabled }: { preview?: "hover" | "focus"; disabled?: boolean }) {
  return (
    <ToggleGroup
      type="single"
      defaultValue="5"
      disabled={disabled}
      aria-label="Refresh interval"
    >
      {intervals.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          data-preview={
            preview === "focus" && item.value === "5"
              ? "focus"
              : preview === "hover" && item.value === "15"
                ? "hover"
                : undefined
          }
        >
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ControlsSection() {
  return (
    <Section
      id="controls"
      title="Input · Switch · Segmented · Checkbox · Feedback"
    >
      {() => (
        <div className="flex flex-col gap-5">
          <Row label="input">
            <State label="default">
              <Input placeholder="Filter cards…" />
            </State>
            <State label="hover">
              <Input
                data-preview="hover"
                placeholder="Filter cards…"
              />
            </State>
            <State label="focus">
              <Input
                data-preview="focus"
                defaultValue="label:bug"
              />
            </State>
            <State label="filled">
              <Input defaultValue="label:bug" />
            </State>
            <State label="icon">
              <Input
                icon={<Search />}
                placeholder="Filter cards…"
              />
            </State>
            <State label="mono">
              <Input
                mono
                defaultValue="ghp_8f2c"
              />
            </State>
            <State label="error">
              <TokenErrorPreview />
            </State>
            <State label="disabled">
              <Input
                disabled
                placeholder="Filter cards…"
              />
            </State>
          </Row>
          <Row label="switch">
            <State label="off">
              <Switch aria-label="Sync when Mac wakes from sleep" />
            </State>
            <State label="on">
              <Switch
                aria-label="Sync when Mac wakes from sleep"
                defaultChecked
              />
            </State>
            <State label="focus">
              <Switch
                aria-label="Sync when Mac wakes from sleep"
                data-preview="focus"
              />
            </State>
            <State label="disabled off">
              <Switch
                aria-label="Sync when Mac wakes from sleep"
                disabled
              />
            </State>
            <State label="disabled on">
              <Switch
                aria-label="Sync when Mac wakes from sleep"
                defaultChecked
                disabled
              />
            </State>
          </Row>
          <Row label="segmented">
            <State label="5 min">
              <IntervalGroup />
            </State>
            <State label="hover">
              <IntervalGroup preview="hover" />
            </State>
            <State label="focus">
              <IntervalGroup preview="focus" />
            </State>
            <State label="disabled">
              <IntervalGroup disabled />
            </State>
          </Row>
          <Row label="checkbox">
            <State label="unchecked">
              <Checkbox aria-label="Select" />
            </State>
            <State label="checked">
              <Checkbox
                aria-label="Select"
                defaultChecked
              />
            </State>
            <State label="focus">
              <Checkbox
                aria-label="Select"
                data-preview="focus"
              />
            </State>
            <State label="disabled">
              <Checkbox
                aria-label="Select"
                disabled
              />
            </State>
            <State label="mark">
              <CheckMark checked={false} />
            </State>
            <State label="mark checked">
              <CheckMark checked />
            </State>
          </Row>
          <Row label="spinner">
            <State label="11">
              <Spinner size={11} />
            </State>
            <State label="14">
              <Spinner />
            </State>
            <State label="18">
              <Spinner size={18} />
            </State>
            <State label="inline">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
                <Spinner size={11} />
                Syncing 3 of 5…
              </span>
            </State>
          </Row>
          <Row label="skeleton">
            <State label="card">
              <div className="flex w-44 flex-col gap-[5px] rounded-xl bg-bg-sunken p-[5px]">
                <div className="flex h-7 items-center gap-[7px] px-1.5">
                  <Skeleton className="size-2 rounded-[2px]" />
                  <Skeleton className="h-[9px] w-14" />
                </div>
                <div className="flex flex-col gap-[7px] rounded-lg bg-surface px-[9px] py-2.5 shadow-card">
                  <div className="flex items-center gap-[7px]">
                    <Skeleton className="size-[11px]" />
                    <Skeleton className="h-[9px] w-24" />
                  </div>
                  <Skeleton className="ml-[18px] h-[9px] w-16" />
                  <div className="ml-[18px] flex items-center gap-1.5">
                    <Skeleton className="h-2 w-14" />
                    <Skeleton className="ml-auto size-4 rounded-full" />
                  </div>
                </div>
              </div>
            </State>
            <State label="row">
              <div className="flex h-row w-52 items-center gap-2">
                <Skeleton className="size-4 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-[9px] w-3/4" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
              </div>
            </State>
          </Row>
          <Row label="progress">
            <State label="indeterminate">
              <Progress />
            </State>
            <State label="62%">
              <Progress value={62} />
            </State>
          </Row>
        </div>
      )}
    </Section>
  );
}
