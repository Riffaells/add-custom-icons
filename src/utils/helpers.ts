import { REGEX, CONFIG } from './constants';
import { IconFile } from '../types';

export class HelperUtils {
	private static colorRegexCache = new Map<string, RegExp>();
	/** Tracks generated IDs within a single load session to detect collisions */
	private static seenIds = new Map<string, string>();
	/** Namespace prefixes used by editor-generated cruft (Inkscape/Illustrator exports) */
	private static readonly CRUFT_NAMESPACE_PREFIXES = ['sodipodi', 'inkscape', 'rdf', 'cc', 'dc'];
	/** One-entry memo for buildColorSet — the color list is constant across a load pass */
	private static lastColorsKey: string | null = null;
	private static lastColorsSet: Set<string> = new Set();
	/** Companion memo: a single alternation regex to test raw SVG text against, so
	 * per-icon DOM color-rewriting can be skipped entirely when none of the
	 * configured colors even appear in the file. */
	private static lastColorsTestRegex: RegExp | null = null;
	/** DOMParser has no per-call state, so one instance is reused across every
	 * icon instead of allocating a new one each time. */
	private static readonly domParser = new DOMParser();

	/** Call before each full icon-load pass to reset collision tracking */
	static resetIdRegistry(): void {
		this.seenIds.clear();
	}

	/**
	 * Releases all cached state held in static maps. Called on plugin unload so
	 * compiled regexes and collision-tracking entries don't linger in memory.
	 */
	static clearCaches(): void {
		this.seenIds.clear();
		this.colorRegexCache.clear();
		this.lastColorsKey = null;
		this.lastColorsSet = new Set();
		this.lastColorsTestRegex = null;
	}

	static generateIconId(icon: IconFile): string {
		const iconFileNameWithoutExtension = icon.name.substring(0, icon.name.lastIndexOf('.'));
		const base = icon.prefix ?
			`${icon.prefix}${CONFIG.ID_SEPARATOR}${iconFileNameWithoutExtension}` :
			iconFileNameWithoutExtension;

		const normalized = base
			.replace(REGEX.WHITESPACE, CONFIG.ID_SEPARATOR)
			.toLowerCase()
			.replace(REGEX.DOTS, CONFIG.ID_SEPARATOR);

		// Detect collisions: if another file already produced this ID, append a
		// short hash of the original path so both icons get unique, stable IDs.
		const existing = this.seenIds.get(normalized);
		if (existing && existing !== icon.path) {
			const hash = HelperUtils.shortHash(icon.path);
			const uniqueId = `${normalized}${CONFIG.ID_SEPARATOR}${hash}`;
			this.seenIds.set(uniqueId, icon.path);
			return uniqueId;
		}

		this.seenIds.set(normalized, icon.path);
		return normalized;
	}

	/** Produces a short (6-char) hex hash of a string for collision disambiguation */
	private static shortHash(str: string): string {
		let h = 0x811c9dc5;
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = (h * 0x01000193) >>> 0;
		}
		return h.toString(16).slice(0, 6);
	}

	static normalizeSvgContent(rawSvgContent: string, monochromeColors: string): string {
		// Guard against empty/whitespace-only files which would otherwise produce
		// an empty icon registered in Obsidian's registry.
		if (!rawSvgContent || !rawSvgContent.trim()) {
			return '';
		}

		// Use DOMParser for robust SVG manipulation instead of fragile regex,
		// which can fail on SVGs with CDATA, comments, or unusual formatting.
		const doc = this.domParser.parseFromString(rawSvgContent, 'image/svg+xml');
		const svgEl = doc.querySelector('svg');

		// Fall back to regex-based approach if parsing fails (e.g. malformed SVG)
		const parseError = doc.querySelector('parsererror');
		if (!svgEl || parseError) {
			return this.normalizeSvgContentFallback(rawSvgContent, monochromeColors);
		}

		// Remove width/height attributes
		svgEl.removeAttribute('width');
		svgEl.removeAttribute('height');

		// Strip editor-generated cruft (Inkscape/Illustrator metadata, namespaced
		// attributes, comments) before touching colors, since it has no rendering
		// purpose and can otherwise interfere with color inheritance. Gated on a
		// cheap string test — this runs per icon on every startup restore, and
		// most icons carry no cruft at all.
		if (/sodipodi|inkscape|<metadata|<!--|rdf:|<script|\son\w+\s*=/i.test(rawSvgContent)) {
			this.stripEditorCruft(doc);
		}

		// Inline <style> class rules onto the elements themselves and drop the
		// <style> block + class attributes. Obsidian injects icons inline into the
		// document, so a <style> block from one icon applies globally — .st0 from
		// icon A would restyle icon B. Inlining removes that cross-icon leakage
		// and also neutralizes the specificity advantage class rules have over
		// presentation attributes.
		this.inlineStyleBlocks(doc, svgEl);

		// Replace user-defined monochrome colors with currentColor. Skip the DOM
		// pass entirely when a cheap text scan shows none of the configured colors
		// appear anywhere in the file — common for icons that already use
		// currentColor or a palette outside the monochrome list.
		const colorSet = this.buildColorSet(monochromeColors);
		if (colorSet.size > 0 && this.getColorTestRegex(monochromeColors)!.test(rawSvgContent)) {
			// One combined pass covers both presentation attributes (fill="#000")
			// and inline style="fill:#000" declarations — the latter win over
			// presentation attributes by CSS specificity, so both must be checked.
			// Class rules were already inlined above, so this also covers them.
			doc.querySelectorAll('[fill],[stroke],[style]').forEach(el => {
				const fill = el.getAttribute('fill');
				if (fill && colorSet.has(fill.toLowerCase())) {
					el.setAttribute('fill', 'currentColor');
				}
				const stroke = el.getAttribute('stroke');
				if (stroke && colorSet.has(stroke.toLowerCase())) {
					el.setAttribute('stroke', 'currentColor');
				}
				const style = el.getAttribute('style');
				if (style) {
					const sanitized = this.sanitizeCssColorDeclarations(style, colorSet);
					if (sanitized !== style) {
						el.setAttribute('style', sanitized);
					}
				}
			});
		}

		// If no fill/stroke is set on the root SVG element, add a default
		if (!svgEl.hasAttribute('fill') && !svgEl.hasAttribute('stroke')) {
			svgEl.setAttribute('fill', 'currentColor');
		}

		return svgEl.outerHTML;
	}

	/**
	 * Removes elements/attributes/comments that editors like Inkscape embed on
	 * export (sodipodi:*, inkscape:*, <metadata>, RDF blocks). These don't render,
	 * but a stray `color:#000` in their default inline styles can pin the value
	 * `currentColor` resolves to before it reaches a fill/stroke declaration.
	 */
	private static stripEditorCruft(doc: Document): void {
		// Single tree walk instead of three (two querySelectorAll('*') passes plus
		// a separate comment TreeWalker): elements and comments are visited once,
		// with removal deferred to arrays so we don't mutate mid-walk.
		const elementsToRemove: Element[] = [];
		const commentsToRemove: Comment[] = [];

		const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);
		let node: Node | null;
		while ((node = walker.nextNode())) {
			if (node.nodeType === Node.COMMENT_NODE) {
				commentsToRemove.push(node as Comment);
				continue;
			}

			const el = node as Element;
			const tagName = el.tagName.toLowerCase();
			const tagPrefix = el.tagName.includes(':') ? tagName.split(':')[0] : '';
			if (tagName === 'metadata' || tagName === 'script' || this.CRUFT_NAMESPACE_PREFIXES.includes(tagPrefix)) {
				elementsToRemove.push(el);
				continue; // the whole subtree is discarded below — no need to clean its attributes
			}

			Array.from(el.attributes).forEach(attr => {
				const name = attr.name;
				const prefix = name.startsWith('xmlns:')
					? name.slice('xmlns:'.length).toLowerCase()
					: (name.includes(':') ? name.split(':')[0].toLowerCase() : '');
				// Drop editor namespaces and inline event handlers (onload, onclick, ...) —
				// the normalized SVG is rendered via innerHTML in the fix-icon preview.
				if (this.CRUFT_NAMESPACE_PREFIXES.includes(prefix) || /^on/i.test(name)) {
					el.removeAttribute(name);
				}
			});
		}

		elementsToRemove.forEach(el => el.remove());
		commentsToRemove.forEach(c => c.parentNode?.removeChild(c));
	}

	/**
	 * Moves declarations from <style> blocks onto matching elements' style
	 * attributes, then removes the <style> elements and all class attributes.
	 * Existing inline declarations win over class-derived ones (matching CSS
	 * specificity); among class rules, later rules override earlier ones.
	 */
	private static inlineStyleBlocks(doc: Document, svgEl: Element): void {
		// Fast early exit for the common no-<style> case before any allocation
		if (!doc.querySelector('style')) {
			return;
		}
		const styleEls = Array.from(doc.querySelectorAll('style'));

		const cssText = styleEls
			.map(s => s.textContent ?? '')
			.join('\n')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			// Drop whole at-rule blocks (@media/@keyframes/@supports) including one
			// level of nested rules. The flat rule regex below cannot match an
			// at-rule as a unit and would otherwise pick up its INNER rules and
			// inline conditional declarations unconditionally.
			.replace(/@[^{}]+\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');

		// Accumulate the final property set per element; later rules overwrite
		// earlier ones for the same property, mimicking source-order cascade.
		const computed = new Map<Element, Map<string, string>>();
		const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
		let ruleMatch: RegExpExecArray | null;
		while ((ruleMatch = ruleRegex.exec(cssText))) {
			const selectorList = ruleMatch[1].trim();
			const props = this.parseCssDeclarations(ruleMatch[2]);
			// Skip at-rules (@media/@font-face bodies) — too complex to inline safely
			if (!selectorList || selectorList.startsWith('@') || props.size === 0) {
				continue;
			}

			for (const rawSelector of selectorList.split(',')) {
				const selector = rawSelector.trim();
				if (!selector) continue;

				let matchedEls: Element[];
				try {
					matchedEls = Array.from(svgEl.querySelectorAll(selector));
					if (svgEl.matches(selector)) {
						matchedEls.push(svgEl);
					}
				} catch {
					continue; // unsupported/invalid selector — skip this rule
				}

				for (const el of matchedEls) {
					let elProps = computed.get(el);
					if (!elProps) {
						elProps = new Map();
						computed.set(el, elProps);
					}
					for (const [prop, value] of props) {
						elProps.set(prop, value);
					}
				}
			}
		}

		computed.forEach((props, el) => {
			const inline = this.parseCssDeclarations(el.getAttribute('style') ?? '');
			for (const [prop, value] of props) {
				if (!inline.has(prop)) {
					inline.set(prop, value);
				}
			}
			const styleStr = Array.from(inline.entries())
				.map(([prop, value]) => `${prop}:${value}`)
				.join(';');
			if (styleStr) {
				el.setAttribute('style', styleStr);
			}
		});

		styleEls.forEach(s => s.remove());

		// Class attributes are useless once rules are inlined, and a <style>
		// block leaked from another inline icon could still target them —
		// removing them makes the icon immune to cross-icon class collisions.
		svgEl.removeAttribute('class');
		svgEl.querySelectorAll('[class]').forEach(el => el.removeAttribute('class'));
	}

	/** Parses "prop:value;prop:value" declaration text into a property map */
	private static parseCssDeclarations(declText: string): Map<string, string> {
		const map = new Map<string, string>();
		for (const decl of declText.split(';')) {
			const idx = decl.indexOf(':');
			if (idx === -1) continue;
			const prop = decl.slice(0, idx).trim().toLowerCase();
			const value = decl.slice(idx + 1).trim();
			if (prop && value) {
				map.set(prop, value);
			}
		}
		return map;
	}

	/**
	 * Extracts all fixed fill/stroke colors used in an SVG (attributes, inline
	 * styles, and <style> blocks). Used by the icon-fix dialog to offer the user
	 * a list of colors that can be converted to currentColor.
	 */
	static extractSvgColors(rawSvgContent: string): string[] {
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
			// comma-separated settings list — skip the bare function-name token.
			if (rawSvgContent[match.index + match[0].length] === '(') continue;
			const key = value.toLowerCase();
			if (IGNORED.has(key) || seen.has(key)) continue;
			seen.add(key);
			colors.push(value);
		}

		return colors;
	}

	/**
	 * Accepts only what the monochrome list can actually round-trip: a hex
	 * literal (#RGB … #RRGGBBAA) or a bare CSS colour keyword. Functional
	 * notations (rgb(...), var(--x)) are rejected because the list is stored as
	 * a single comma-separated string and their own commas would split them.
	 */
	static isValidColor(color: string): boolean {
		if (/^#[0-9A-Fa-f]{3,8}$/.test(color)) {
			return true;
		}
		return /^[a-z]+$/i.test(color);
	}

	/** Splits the comma-separated monochrome color list, preserving original casing */
	static parseColorList(monochromeColors: string): string[] {
		if (!monochromeColors) return [];
		return monochromeColors.split(',').map(c => c.trim()).filter(c => c.length > 0);
	}

	/**
	 * Splits/normalizes the comma-separated monochrome color list into a lookup
	 * set. Memoized on the input string — it is called once per icon during
	 * load/restore passes with an identical argument every time.
	 */
	private static buildColorSet(monochromeColors: string): Set<string> {
		this.ensureColorMemo(monochromeColors);
		return this.lastColorsSet;
	}

	/**
	 * Companion to buildColorSet: a single case-insensitive alternation regex
	 * that matches if ANY configured color appears as a substring anywhere in
	 * the raw SVG text. Lets callers skip a full DOM query/rewrite pass for
	 * icons that don't use any of the monochrome colors at all. A substring hit
	 * can be a false positive (e.g. a color word inside an unrelated id), but
	 * that only costs a redundant DOM pass — it never causes a missed rewrite.
	 */
	private static getColorTestRegex(monochromeColors: string): RegExp | null {
		this.ensureColorMemo(monochromeColors);
		return this.lastColorsTestRegex;
	}

	private static ensureColorMemo(monochromeColors: string): void {
		if (this.lastColorsKey === monochromeColors) {
			return;
		}
		const colors = this.parseColorList(monochromeColors).map(c => c.toLowerCase());
		this.lastColorsSet = new Set(colors);
		this.lastColorsTestRegex = colors.length > 0
			? new RegExp(colors.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
			: null;
		this.lastColorsKey = monochromeColors;
	}

	/**
	 * Rewrites `fill`/`stroke` CSS declarations that match a configured monochrome
	 * color to `currentColor`, and drops `color:` declarations whose value is in
	 * the set, so an editor-exported default doesn't pin currentColor resolution.
	 * `color:` values outside the set are preserved — icons legitimately use
	 * `color:` + `fill="currentColor"` as a two-tone technique.
	 * Works on both inline `style="..."` attribute values and `<style>` block text.
	 */
	private static sanitizeCssColorDeclarations(cssText: string, colorSet: Set<string>): string {
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

	/** Regex-based fallback for malformed SVGs that DOMParser cannot handle */
	private static normalizeSvgContentFallback(rawSvgContent: string, monochromeColors: string): string {
		let svgContent = rawSvgContent.replace(REGEX.SVG_DIMENSIONS, '');

		// Strip editor cruft (metadata/sodipodi/RDF blocks, comments) the same way
		// the DOMParser path does, since it can't be relied on to be well-formed here.
		// The paired-tag form is removed before the self-closing form so a lazy
		// match can't stop at a self-closing CHILD (e.g. <inkscape:grid/>) and
		// leave an orphaned close tag behind.
		svgContent = svgContent
			.replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
			.replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/gi, '')
			.replace(/<sodipodi:namedview[^>]*\/>/gi, '')
			.replace(/<rdf:rdf[\s\S]*?<\/rdf:rdf>/gi, '')
			.replace(/<!--[\s\S]*?-->/g, '');

		if (monochromeColors) {
			let colorsRegex = this.colorRegexCache.get(monochromeColors);

			if (!colorsRegex) {
				const colors = this.parseColorList(monochromeColors);
				if (colors.length > 0) {
					// Match both fill="#000" and fill='#000'
					colorsRegex = new RegExp(`(fill|stroke)=(["'])(${colors.join('|')})\\2`, 'gi');
					this.colorRegexCache.set(monochromeColors, colorsRegex);
				}
			}

			if (colorsRegex) {
				svgContent = svgContent.replace(colorsRegex, '$1=$2currentColor$2');
			}

			// Also rewrite fill/stroke set via inline style="" or <style> block CSS,
			// which win over the presentation attributes handled above.
			const colorSet = this.buildColorSet(monochromeColors);
			if (colorSet.size > 0) {
				svgContent = this.sanitizeCssColorDeclarations(svgContent, colorSet);
			}
		}

		if (!REGEX.SVG_HAS_FILL_STROKE.test(svgContent)) {
			svgContent = svgContent.replace('<svg', '<svg fill="currentColor"');
		}

		return svgContent;
	}

	static cleanFolderName(folderName: string): string {
		return folderName
			.replace(REGEX.WHITESPACE, CONFIG.ID_SEPARATOR)
			.toLowerCase();
	}

	static async runPromisesSequentiallyWithYielding<T, U>(
		items: T[],
		asyncFn: (item: T) => Promise<U>,
		yieldEvery = 50
	): Promise<U[]> {
		const results: U[] = [];

		for (let i = 0; i < items.length; i++) {
			const result = await asyncFn(items[i]);
			results.push(result);

			// Yield to the main thread every N items to keep the UI responsive
			// without creating thousands of unnecessary macrotasks
			if ((i + 1) % yieldEvery === 0) {
				await new Promise(resolve => window.setTimeout(resolve, 0));
			}
		}

		return results;
	}
}
