import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSchema, type GraphQLError, parse, validate } from "graphql";

const graphqlDir = join(import.meta.dir, "..", "crates", "planche-core", "graphql");
const schemaFile = "schema.docs.graphql";

const schema = buildSchema(readFileSync(join(graphqlDir, schemaFile), "utf8"), {
  assumeValidSDL: true,
});

const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(graphqlDir)
        .filter((name) => name.endsWith(".graphql") && name !== schemaFile)
        .sort()
        .map((name) => join(graphqlDir, name));

const operations: string[] = [];
const errors: { file: string; error: GraphQLError }[] = [];

for (const file of files) {
  let document: ReturnType<typeof parse>;

  try {
    document = parse(readFileSync(file, "utf8"));
  } catch (error) {
    errors.push({ file, error: error as GraphQLError });
    continue;
  }

  for (const definition of document.definitions) {
    if (definition.kind === "OperationDefinition") {
      operations.push(definition.name?.value ?? "(anonymous)");
    }
  }

  for (const error of validate(schema, document)) {
    errors.push({ file, error });
  }
}

console.log(`operations: ${operations.join(", ")}`);

for (const { file, error } of errors) {
  const at = error.locations?.map((l) => `${file}:${l.line}:${l.column}`).join(" ") ?? file;

  console.log(`ERROR: ${error.message} ${at}`);
}

if (errors.length > 0) {
  console.log(`INVALID: ${errors.length} errors`);
  process.exit(1);
}

console.log(`VALID: ${operations.length} operations against the official schema`);
