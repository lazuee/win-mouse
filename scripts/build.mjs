import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process, { env } from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);
const args = process.argv.slice(2);

const buildLib = args.find((arg) => arg === "--lib");
const buildNative = args.find((arg) => arg === "--native");
const arch = process.arch;
const platform = process.platform;
const isWinArm64 =
  platform === "win32" &&
  arch === "x64" &&
  args.find((arg) => arg === "--arch=arm64");

if ([buildLib, buildNative].filter(Boolean).length < 1) {
  process.exit(1);
}

function replaceLinks(str) {
  if (!packageJson.homepage) return str;
  return str.replace(/(\[.*?\]\()(\.\/.*?\))/g, (_, p1, p2) => {
    const rel = p2.replace("./", "");
    return `${p1}${packageJson.homepage}/blob/HEAD/${rel}`;
  });
}

if (buildNative) {
  const build = (_arch, skipBuild = false) => {
    console.log(`Building native package for ${platform}-${_arch}...`);
    if (!skipBuild) {
      spawnSync("pnpm", ["run", "build:native", `--arch=${_arch}`], {
        shell: true,
        stdio: "inherit",
        cwd: rootDir,
      });
    }

    const nativeName = `${packageJson.name}-${platform}-${_arch}`;
    const nativeDir = join(rootDir, "node_modules", nativeName);

    if (existsSync(nativeDir)) {
      rmSync(nativeDir, { recursive: true, force: true });
    }
    mkdirSync(nativeDir, { recursive: true });

    ["win_mouse"].forEach((file) => {
      [".node", ".pdb"].forEach((ext) => {
        const src = join(rootDir, "build", "Release", `${file}${ext}`);
        const dest = join(nativeDir, `${file}${ext}`);
        if (existsSync(src)) copyFileSync(src, dest);
        else throw new Error(`Missing: ${src}`);
      });
    });

    const pkg = {
      name: nativeName,
      version: packageJson.version,
      description: `Prebuilt ${platform}-${_arch} binaries for ${packageJson.name}`,
      license: packageJson.license,
      author: packageJson.author,
      homepage: packageJson.homepage,
      repository: packageJson.repository,
      bugs: packageJson.bugs,
      os: [platform],
      cpu: [_arch],
    };
    writeFileSync(
      join(nativeDir, "package.json"),
      JSON.stringify(pkg, null, 2),
    );

    const readme = `## ${nativeName}\n\n> Prebuilt ${platform}-${_arch} binaries for \`${packageJson.name}\`.`;
    writeFileSync(join(nativeDir, "README.md"), replaceLinks(readme));
    copyFileSync(join(rootDir, "LICENSE.md"), join(nativeDir, "LICENSE.md"));

    console.log("Native package built at", nativeDir);
  };

  build(arch, env.CI);
  if (isWinArm64) build("arm64");
}

if (buildLib) {
  spawnSync("pnpm", ["run", "build:lib"], {
    shell: true,
    stdio: "inherit",
    cwd: rootDir,
  });

  const libDir = join(rootDir, "dist");
  let exports = packageJson.exports;
  try {
    exports = JSON.parse(
      JSON.stringify(exports).replaceAll(`${relative(rootDir, libDir)}/`, ""),
    );
  } catch {}

  const pkg = {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    keywords: packageJson.keywords,
    license: packageJson.license,
    author: packageJson.author,
    homepage: packageJson.homepage,
    repository: packageJson.repository,
    bugs: packageJson.bugs,
    exports,
    dependencies: packageJson.dependencies,
    optionalDependencies: ["x64", "arm64"].reduce((acc, arch) => {
      acc[`${packageJson.name}-${platform}-${arch}`] =
        `^${packageJson.version}`;
      return acc;
    }, {}),
    os: [platform],
  };
  writeFileSync(join(libDir, "package.json"), JSON.stringify(pkg, null, 2));

  const readme = readFileSync(join(rootDir, "README.md"), "utf8");
  writeFileSync(join(libDir, "README.md"), replaceLinks(readme));
  copyFileSync(join(rootDir, "LICENSE.md"), join(libDir, "LICENSE.md"));

  console.log("Library package built at", libDir);
}
