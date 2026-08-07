import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const policy = JSON.parse(
  await readFile(`${repositoryRoot}/.github/merge-policy.json`, "utf8"),
);

export function classifyChangedPaths(paths, definition = policy) {
  const protectedPaths = paths.filter((path) =>
    definition.protectedFiles.includes(path) ||
    definition.protectedPrefixes.some((prefix) => path.startsWith(prefix)),
  );
  return {
    classification: protectedPaths.length > 0 ? "protected" : "auto",
    protectedPaths,
    paths,
  };
}

if (import.meta.main) {
  const filesArgument = process.argv.indexOf("--files");
  const filesFileArgument = process.argv.indexOf("--files-file");
  const files = filesFileArgument >= 0
    ? (await readFile(process.argv[filesFileArgument + 1], "utf8"))
        .split(/\r?\n/)
        .filter(Boolean)
    : filesArgument >= 0
      ? process.argv.slice(filesArgument + 1)
      : [];
  console.log(JSON.stringify(classifyChangedPaths(files), null, 2));
}
