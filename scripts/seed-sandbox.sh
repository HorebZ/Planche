#!/usr/bin/env bash
# Creates the throwaway "Planche Sandbox" project used by the CLI and app tests.
# Needs the `project` scope on the gh session: gh auth refresh -s project
set -euo pipefail

title="Planche Sandbox"
count=150
dry_run=false

case "${1:-}" in
	"") ;;
	--dry-run) dry_run=true ;;
	*)
		echo "usage: $0 [--dry-run]" >&2
		exit 2
		;;
esac

run() {
	if $dry_run; then
		echo "would run: $*"
	else
		"$@" >/dev/null
	fi
}

existing=$(gh project list --owner @me --limit 200 --format json \
	--jq ".projects[] | select(.title == \"$title\") | .number")
if [[ -n "$existing" ]]; then
	echo "project exists, nothing to create (#$existing)"
	exit 0
fi

if $dry_run; then
	number="<new>"
	echo "would run: gh project create --owner @me --title \"$title\""
else
	number=$(gh project create --owner @me --title "$title" --format json --jq .number)
	echo "created project #$number"
fi

# New projects already carry Status with Todo, In Progress and Done.
run gh project field-create "$number" --owner @me --name Priority \
	--data-type SINGLE_SELECT --single-select-options "Low,Medium,High"

for i in $(seq 1 "$count"); do
	run gh project item-create "$number" --owner @me --title "Seed item $i"
	if ! $dry_run; then
		echo "created Seed item $i/$count"
		# Stays under GitHub's limit of 80 content creations per minute.
		sleep 1
	fi
done

if $dry_run; then
	echo "dry run: 1 project, 1 field, $count draft items, nothing sent"
else
	echo "seeded project #$number with $count draft items"
fi
