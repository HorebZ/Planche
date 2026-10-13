#!/usr/bin/env bash
set -euo pipefail

target="$(dirname "$0")/../crates/planche-core/graphql/schema.docs.graphql"
curl --fail --silent --show-error --location \
	https://docs.github.com/public/fpt/schema.docs.graphql \
	--output "$target"
echo "updated $(wc -l <"$target" | tr -d ' ') lines in crates/planche-core/graphql/schema.docs.graphql"
