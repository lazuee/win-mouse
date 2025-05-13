import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import process, { env } from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);
const args = process.argv.slice(2);

const runId = args.find((arg) => arg.startsWith("--runId="))?.split("=")[1];
if (!runId) {
  console.error("Error: --runId=<number> argument is required");
  process.exit(1);
}

console.log(
  `
Please confirm the following before continuing:

1. The "version" field in package.json has been updated.
2. The changes have been pushed to GitHub.
3. GitHub Actions run with ID '${runId}' corresponds to that commit and has completed.

Continue? (y/n)
`.trim(),
);

const confirm = spawnSync(
  "node",
  [
    "-e",
    `
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (data) => {
      const input = data.toString().toLowerCase();
      if (input === 'y') process.exit(0);
      if (input === 'n' || input === '\\x03') process.exit(1);
    });
    `,
  ],
  {
    shell: false,
    stdio: "inherit",
  },
);

if (confirm.status !== 0) {
  console.log("Aborted.");
  process.exit(1);
}

if (process.env.NPM_AUTH_TOKEN) {
  writeFileSync(
    join(process.env.HOME, ".npmrc"),
    `//registry.npmjs.org/:_authToken=${process.env.NPM_AUTH_TOKEN}`,
  );
}

const npmAuth = spawnSync("npm", ["whoami"], {
  shell: true,
});
if (npmAuth.status !== 0) {
  console.error(
    "Error: NPM authentication failed. Please run 'npm login' or ensure NPM_AUTH_TOKEN is set",
  );
  process.exit(1);
}

try {
  const versions = JSON.parse(
    spawnSync("npm", ["view", packageJson.name, "versions", "--json"], {
      shell: true,
    })
      .stdout.toString()
      .trim(),
  );

  if (versions.includes(packageJson.version)) {
    console.error("Error: package.json version has not been incremented.");
    console.warn("Please update the version before publishing.");
    process.exit(1);
  }
} catch {}

const outDir = join(rootDir, "node_modules", ".out");
if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

if (env.GITHUB_TOKEN) {
  spawnSync("gh", ["auth", "login", "--with-token", env.GITHUB_TOKEN]);
}

const ghAuth = spawnSync("gh", ["auth", "status"]);
if (ghAuth.status !== 0) {
  console.error(
    "Error: GH authentication failed. Please run 'gh auth login' or ensure GITHUB_TOKEN is set",
  );
  process.exit(1);
}

const repo = new URL(
  spawnSync("git", ["remote", "get-url", "origin"], {
    shell: true,
    stdio: "pipe",
  }).stdout.toString(),
).pathname
  .replace("/", "")
  .replace(/.git$/, "");
const artifacts = spawnSync(
  "gh",
  ["run", "download", runId, "--dir", outDir, "--repo", repo],
  {
    shell: true,
    env: { ...env },
  },
);
if (artifacts.status !== 0) {
  console.error("Error: Failed to download artifacts using GitHub CLI.");
  process.exit(1);
}

const packageJsons = {};
const mismatches = [];
readdirSync(outDir)
  .filter((dir) => dir.startsWith(packageJson.name.split("/")[1]))
  .map((dir) => join(outDir, dir))
  .forEach((dir) => {
    packageJsons[dir] = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8"),
    );

    if (packageJsons[dir].version !== packageJson.version) {
      mismatches.push({
        name: packageJsons[dir].name,
        expected: packageJson.version,
        actual: packageJsons[dir].version,
      });
    }
  });

if (mismatches.length > 0) {
  console.error(
    "Error: Version mismatch detected between root package and artifacts:",
  );
  mismatches.forEach((m) =>
    console.error(`  - ${m.name}: expected ${m.expected}, found ${m.actual}`),
  );
  process.exit(1);
}

Object.entries(packageJsons).forEach(([dir, { name, version }]) => {
  try {
    const versions = JSON.parse(
      spawnSync("npm", ["view", name, "versions", "--json"], {
        shell: true,
      })
        .stdout.toString()
        .trim(),
    );

    if (Array.isArray(versions) && versions.includes(version)) {
      console.error("Error: package.json version has not been incremented.");
      console.warn("Please update the version before publishing.");
      process.exit(1);
    }
  } catch {}

  const publish = spawnSync("npm", ["publish", "--access=public"], {
    shell: true,
    cwd: dir,
  });
  if (publish.status !== 0) {
    console.error(`Error: Failed to publish '${name}@${version}'.`);
    process.exit(1);
  }

  console.log(`Package '${name}@${version}' published.`);
});
