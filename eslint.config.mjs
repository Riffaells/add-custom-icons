import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores(["build/", "main.js", "node_modules/"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mjs", "esbuild.config.mjs", "version-bump.mjs"],
				},
			},
		},
	},
	{
		// Build tooling, not plugin code: it runs in Node by design and never
		// ships to a mobile client.
		files: ["*.mjs"],
		languageOptions: {
			globals: { process: "readonly", console: "readonly" },
		},
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
]);
