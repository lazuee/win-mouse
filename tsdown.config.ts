import { defineConfig, type Options } from "tsdown";

export const baseConfig: Options = {
  clean: true,
  dts: true,
  fixedExtension: true,
  format: ["cjs", "esm"],
  platform: "node",
  removeNodeProtocol: true,
  shims: true,
  skipNodeModulesBundle: true,
  unused: false,
};

const config: ReturnType<typeof defineConfig> = defineConfig({
  ...baseConfig,
  entry: ["src/index.ts"],
  inputOptions: { resolve: { tsconfigFilename: "tsconfig.json" } },
});

export default config;
