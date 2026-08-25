/**
 * Memoizes the monochrome color list -> lookup Set + test regex. The list is
 * constant across an entire load/restore pass, so every icon in that pass
 * reuses the same parsed result instead of re-splitting the string.
 */
let lastColorsKey: string | null = null;
let lastColorsSet: Set<string> = new Set();
/** A single alternation regex to test raw SVG text against, so per-icon DOM
 * color-rewriting can be skipped entirely when none of the configured colors
 * even appear in the file. */
let lastColorsTestRegex: RegExp | null = null;

function ensureMemo(monochromeColors: string): void {
	if (lastColorsKey === monochromeColors) {
		return;
	}
	const colors = parseColorList(monochromeColors).map(c => c.toLowerCase());
	lastColorsSet = new Set(colors);
	lastColorsTestRegex = colors.length > 0
		? new RegExp(colors.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
		: null;
	lastColorsKey = monochromeColors;
}

/** Splits the comma-separated monochrome color list, preserving original casing */
export function parseColorList(monochromeColors: string): string[] {
	if (!monochromeColors) return [];
	return monochromeColors.split(',').map(c => c.trim()).filter(c => c.length > 0);
}

/**
 * Accepts only what the monochrome list can actually round-trip: a hex
 * literal (#RGB ... #RRGGBBAA) or a bare CSS colour keyword. Functional
 * notations (rgb(...), var(--x)) are rejected because the list is stored as
 * a single comma-separated string and their own commas would split them.
 */
export function isValidColor(color: string): boolean {
	if (/^#[0-9A-Fa-f]{3,8}$/.test(color)) {
		return true;
	}
	return /^[a-z]+$/i.test(color);
}

/**
 * Lookup set for the given color list. Memoized on the input string - it is
 * called once per icon during load/restore passes with an identical argument
 * every time.
 */
export function buildColorSet(monochromeColors: string): Set<string> {
	ensureMemo(monochromeColors);
	return lastColorsSet;
}

/**
 * A single case-insensitive alternation regex that matches if ANY configured
 * color appears as a substring anywhere in the raw SVG text. Lets callers
 * skip a full DOM query/rewrite pass for icons that don't use any of the
 * monochrome colors at all. A substring hit can be a false positive (e.g. a
 * color word inside an unrelated id), but that only costs a redundant DOM
 * pass - it never causes a missed rewrite.
 */
export function getColorTestRegex(monochromeColors: string): RegExp | null {
	ensureMemo(monochromeColors);
	return lastColorsTestRegex;
}

/**
 * Rewrites `fill`/`stroke` CSS declarations that match a configured monochrome
 * color to `currentColor`, and drops `color:` declarations whose value is in
 * the set, so an editor-exported default doesn't pin currentColor resolution.
 * `color:` values outside the set are preserved - icons legitimately use
 * `color:` + `fill="currentColor"` as a two-tone technique.
 * Works on both inline `style="..."` attribute values and `<style>` block text.
 */
export function sanitizeCssColorDeclarations(cssText: string, colorSet: Set<string>): string {
	// Only a bare `color:` property, not `stop-color`/`flood-color`/etc.
	let result = cssText.replace(
		/(^|[;{])(\s*)color\s*:\s*([^;}"']+);?/gi,
		(match, sep: string, _ws: string, rawValue: string) => {
			const value = rawValue.trim().replace(/\s*!important$/i, '');
			return colorSet.has(value.toLowerCase()) ? sep : match;
		}
	);

	result = result.replace(/(fill|stroke)\s*:\s*([^;}"']+)/gi, (match, prop: string, rawValue: string) => {
		let value = rawValue.trim();
		let important = '';
		const importantMatch = value.match(/^(.*?)\s*(!important)$/i);
		if (importantMatch) {
			value = importantMatch[1].trim();
			important = ' !important';
		}
		if (colorSet.has(value.toLowerCase())) {
			return `${prop}:currentColor${important}`;
		}
		return match;
	});

	return result;
}

/** Releases memoized state. Called on plugin unload. */
export function clearColorMemo(): void {
	lastColorsKey = null;
	lastColorsSet = new Set();
	lastColorsTestRegex = null;
}
