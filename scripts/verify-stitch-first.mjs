import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "config", "stitch-provenance.json");

if (!fs.existsSync(manifestPath)) {
  console.error("Missing config/stitch-provenance.json");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const requiredProjectFiles = [
  ["SITE", manifest.sitePlan],
  ["DESIGN", manifest.designSystem],
  ["BATON", manifest.baton],
];

let hasError = false;

function resolveProjectFile(relativePath) {
  return path.resolve(root, relativePath);
}

console.log(`Stitch project: ${manifest.projectId}`);

for (const [label, relativePath] of requiredProjectFiles) {
  const fullPath = resolveProjectFile(relativePath);
  const exists = fs.existsSync(fullPath);
  console.log(`${exists ? "PASS" : "FAIL"} ${label} ${fullPath}`);
  if (!exists) {
    hasError = true;
  }
}

for (const [route, config] of Object.entries(manifest.routes)) {
  const fullPath = resolveProjectFile(config.artifact);
  const exists = fs.existsSync(fullPath);
  const required = config.status === "backed";
  const pass = required ? exists : true;
  const summary = `${route} -> ${config.page} [${config.status}]`;
  console.log(`${pass ? "PASS" : "FAIL"} ${summary} ${fullPath}`);

  if (!pass) {
    hasError = true;
  }
}

if (hasError) {
  console.error("Stitch-first verification failed.");
  process.exit(1);
}

console.log("Stitch-first verification passed.");
