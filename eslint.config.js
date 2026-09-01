import { defineConfig, globalIgnores } from "eslint/config";

import globals from "globals";
import js from "@eslint/js";

export default defineConfig([globalIgnores(["**/dist/"]), {
    extends: [js.configs.recommended],

    languageOptions: {
        globals: {
            ...globals.node,
        },

        ecmaVersion: 2024,
        sourceType: "module",
    },

    rules: {},
}]);
