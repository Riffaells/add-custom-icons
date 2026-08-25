import { REGEX } from '../constants';
import { buildColorSet, getColorTestRegex, sanitizeCssColorDeclarations, parseColorList } from './colorMemo';

/** Namespace prefixes used by editor-generated cruft (Inkscape/Illustrator exports) */
const CRUFT_NAMESPACE_PREFIXES = ['sodipodi', 'inkscape', 'rdf', 'cc', 'dc'];

/** DOMParser has no per-call state, so one instance is reused across every
 * icon instead of allocating a new one each time. */
const domParser = new DOMParser();

/** Compiled color-matching regex for the regex-based fallback path, keyed by
 * the raw monochrome color list string. */
const colorRegexCache = new Map<string, RegExp>();

export function normalizeSvgContent(rawSvgContent: string, monochromeColors: string): string {
	// Guard against empty/whitespace-only files which would otherwise produce
	// an empty icon registered in Obsidian's registry.
	if (!rawSvgContent || !rawSvgContent.trim()) {
		return '';
	}

	// Use DOMParser for robust SVG manipulation instead of fragile regex,
	// which can fail on SVGs with CDATA, comments, or unusual formatting.
	const doc = domParser.parseFromString(rawSvgContent, 'image/svg+xml');
	const svgEl = doc.querySelector('svg');

	// Fall back to regex-based approach if parsing fails (e.g. malformed SVG)
	const parseError = doc.querySelector('parsererror');
	if (!svgEl || parseError) {
		return normalizeSvgContentFallback(rawSvgContent, monochromeColors);
	}

	// Remove width/height attributes
	svgEl.removeAttribute('width');
	svgEl.removeAttribute('height');

	// Strip editor-generated cruft (Inkscape/Illustrator metadata, namespaced
	// attributes, comments) before touching colors, since it has no rendering
	// purpose and can otherwise interfere with color inheritance. Gated on a
	// cheap string test - this runs per icon on every startup restore, and
	// most icons carry no cruft at all.
	if (/sodipodi|inkscape|<metadata|<!--|rdf:|<script|\son\w+\s*=/i.test(rawSvgContent)) {
		stripEditorCruft(doc);
	}

	// Inline <style> class rules onto the elements themselves and drop the
	// <style> block + class attributes. Obsidian injects icons inline into the
	// document, so a <style> block from one icon applies globally - .st0 from
	// icon A would restyle icon B. Inlining removes that cross-icon leakage
	// and also neutralizes the specificity advantage class rules have over
	// presentation attributes.
	inlineStyleBlocks(doc, svgEl);

	// Replace user-defined monochrome colors with currentColor. Skip the DOM
	// pass entirely when a cheap text scan shows none of the configured colors
	// appear anywhere in the file - common for icons that already use
	// currentColor or a palette outside the monochrome list.
	const colorSet = buildColorSet(monochromeColors);
	if (colorSet.size > 0 && getColorTestRegex(monochromeColors)!.test(rawSvgContent)) {
		// One combined pass covers both presentation attributes (fill="#000")
		// and inline style="fill:#000" declarations - the latter win over
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
				const sanitized = sanitizeCssColorDeclarations(style, colorSet);
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
function stripEditorCruft(doc: Document): void {
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
		if (tagName === 'metadata' || tagName === 'script' || CRUFT_NAMESPACE_PREFIXES.includes(tagPrefix)) {
			elementsToRemove.push(el);
			continue; // the whole subtree is discarded below - no need to clean its attributes
		}

		Array.from(el.attributes).forEach(attr => {
			const name = attr.name;
			const prefix = name.startsWith('xmlns:')
				? name.slice('xmlns:'.length).toLowerCase()
				: (name.includes(':') ? name.split(':')[0].toLowerCase() : '');
			// Drop editor namespaces and inline event handlers (onload, onclick, ...) -
			// the normalized SVG is rendered via innerHTML in the fix-icon preview.
			if (CRUFT_NAMESPACE_PREFIXES.includes(prefix) || /^on/i.test(name)) {
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
function inlineStyleBlocks(doc: Document, svgEl: Element): void {
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
		const props = parseCssDeclarations(ruleMatch[2]);
		// Skip at-rules (@media/@font-face bodies) - too complex to inline safely
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
				continue; // unsupported/invalid selector - skip this rule
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
		const inline = parseCssDeclarations(el.getAttribute('style') ?? '');
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
	// block leaked from another inline icon could still target them -
	// removing them makes the icon immune to cross-icon class collisions.
	svgEl.removeAttribute('class');
	svgEl.querySelectorAll('[class]').forEach(el => el.removeAttribute('class'));
}

/** Parses "prop:value;prop:value" declaration text into a property map */
function parseCssDeclarations(declText: string): Map<string, string> {
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

/** Regex-based fallback for malformed SVGs that DOMParser cannot handle */
function normalizeSvgContentFallback(rawSvgContent: string, monochromeColors: string): string {
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
		.replace(/<!--[\s\S]*?-->/g, '')
		// Same script/event-handler removal as stripEditorCruft() - this path
		// runs on malformed SVGs the DOMParser branch couldn't clean, and the
		// result still ends up rendered via innerHTML (icon preview, Obsidian's
		// own icon registry), so it needs the same treatment.
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<script\b[^>]*\/>/gi, '')
		.replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
		.replace(/\son\w+\s*=\s*'[^']*'/gi, '');

	if (monochromeColors) {
		let colorsRegex = colorRegexCache.get(monochromeColors);

		if (!colorsRegex) {
			const colors = parseColorList(monochromeColors);
			if (colors.length > 0) {
				// Match both fill="#000" and fill='#000'
				colorsRegex = new RegExp(`(fill|stroke)=(["'])(${colors.join('|')})\\2`, 'gi');
				colorRegexCache.set(monochromeColors, colorsRegex);
			}
		}

		if (colorsRegex) {
			svgContent = svgContent.replace(colorsRegex, '$1=$2currentColor$2');
		}

		// Also rewrite fill/stroke set via inline style="" or <style> block CSS,
		// which win over the presentation attributes handled above.
		const colorSet = buildColorSet(monochromeColors);
		if (colorSet.size > 0) {
			svgContent = sanitizeCssColorDeclarations(svgContent, colorSet);
		}
	}

	if (!REGEX.SVG_HAS_FILL_STROKE.test(svgContent)) {
		svgContent = svgContent.replace('<svg', '<svg fill="currentColor"');
	}

	return svgContent;
}

/** Releases the fallback-path regex cache. Called on plugin unload. */
export function clearSvgNormalizerCaches(): void {
	colorRegexCache.clear();
}
