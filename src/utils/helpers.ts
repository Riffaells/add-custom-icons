import { REGEX, CONFIG } from './constants';
import { IconFile } from '../types';

export class HelperUtils {
	private static colorRegexCache = new Map<string, RegExp>();
	/** Tracks generated IDs within a single load session to detect collisions */
	private static seenIds = new Map<string, string>();

	/** Call before each full icon-load pass to reset collision tracking */
	static resetIdRegistry(): void {
		this.seenIds.clear();
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
		// Use DOMParser for robust SVG manipulation instead of fragile regex,
		// which can fail on SVGs with CDATA, comments, or unusual formatting.
		const parser = new DOMParser();
		const doc = parser.parseFromString(rawSvgContent, 'image/svg+xml');
		const svgEl = doc.querySelector('svg');

		// Fall back to regex-based approach if parsing fails (e.g. malformed SVG)
		const parseError = doc.querySelector('parsererror');
		if (!svgEl || parseError) {
			return this.normalizeSvgContentFallback(rawSvgContent, monochromeColors);
		}

		// Remove width/height attributes
		svgEl.removeAttribute('width');
		svgEl.removeAttribute('height');

		// Replace user-defined monochrome colors with currentColor
		if (monochromeColors) {
			const colors = monochromeColors.split(',').map(c => c.trim().toLowerCase()).filter(c => c.length > 0);
			if (colors.length > 0) {
				const colorSet = new Set(colors);
				doc.querySelectorAll('[fill],[stroke]').forEach(el => {
					const fill = el.getAttribute('fill');
					const stroke = el.getAttribute('stroke');
					if (fill && colorSet.has(fill.toLowerCase())) {
						el.setAttribute('fill', 'currentColor');
					}
					if (stroke && colorSet.has(stroke.toLowerCase())) {
						el.setAttribute('stroke', 'currentColor');
					}
				});
			}
		}

		// If no fill/stroke is set on the root SVG element, add a default
		if (!svgEl.hasAttribute('fill') && !svgEl.hasAttribute('stroke')) {
			svgEl.setAttribute('fill', 'currentColor');
		}

		return svgEl.outerHTML;
	}

	/** Regex-based fallback for malformed SVGs that DOMParser cannot handle */
	private static normalizeSvgContentFallback(rawSvgContent: string, monochromeColors: string): string {
		let svgContent = rawSvgContent.replace(REGEX.SVG_DIMENSIONS, '');
		
		if (monochromeColors) {
			let colorsRegex = this.colorRegexCache.get(monochromeColors);
			
			if (!colorsRegex) {
				const colors = monochromeColors.split(',').map(c => c.trim()).filter(c => c.length > 0);
				if (colors.length > 0) {
					colorsRegex = new RegExp(`(fill|stroke)="(${colors.join('|')})"`, 'gi');
					this.colorRegexCache.set(monochromeColors, colorsRegex);
				}
			}
			
			if (colorsRegex) {
				svgContent = svgContent.replace(colorsRegex, '$1="currentColor"');
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
