/**
 * Extracts all fixed fill/stroke colors used in an SVG (attributes, inline
 * styles, and <style> blocks). Used by the icon-fix dialog to offer the user
 * a list of colors that can be converted to currentColor.
 */
export function extractSvgColors(rawSvgContent: string): string[] {
	const IGNORED = new Set([
		'none', 'currentcolor', 'inherit', 'transparent', 'initial', 'unset',
		'url', 'context', 'rgb', 'rgba', 'hsl', 'hsla', 'var', 'color'
	]);
	const seen = new Set<string>();
	const colors: string[] = [];

	const colorRegex = /(?<![\w-])(?:fill|stroke)\s*[:=]\s*["']?(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/g;
	let match: RegExpExecArray | null;
	while ((match = colorRegex.exec(rawSvgContent))) {
		const value = match[1];
		// Functional notation (rgb(...), var(--x)) can't be stored in the
		// comma-separated settings list - skip the bare function-name token.
		if (rawSvgContent[match.index + match[0].length] === '(') continue;
		const key = value.toLowerCase();
		if (IGNORED.has(key) || seen.has(key)) continue;
		seen.add(key);
		colors.push(value);
	}

	return colors;
}
