import { configFormat, defineESLintConfig } from "@ntnyq/eslint-config";

export default defineESLintConfig(
  {
    ignores: ["**/README.md/*.ts"],
    importX: {
      overrides: {
        "import-x/consistent-type-specifier-style": ["error", "prefer-inline"],
        "import-x/no-duplicates": ["error", { "prefer-inline": true }],
      },
    },
    jsdoc: {
      overrides: {
        "jsdoc/no-types": "off",
      },
    },
    specials: {
      overridesScriptsRules: {
        "antfu/top-level-function": "error",
      },
    },
    typescript: {
      tsconfigPath: "./tsconfig.json",
      overrides: {
        "no-template-curly-in-string": "off",
      },
      overridesTypeAwareRules: {
        "@typescript-eslint/no-redundant-type-constituents": "off",
        "@typescript-eslint/no-use-before-define": "off",
      },
    },
  },
  configFormat({ prettierOptions: { semi: true } }),
);
