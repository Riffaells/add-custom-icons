import { REGEX, CONFIG } from './constants';
import { IconFile } from '../types';

export class HelperUtils {
	private static colorRegexCache = new Map<string, RegExp>();

	static generateIconId(icon: IconFile): string {
		const iconFileNameWithoutExtension = icon.name.substring(0, icon.name.lastIndexOf('.'));
		const iconId = icon.prefix ?
			`${icon.prefix}${CONFIG.ID_SEPARATOR}${iconFileNameWithoutExtension}` :
			iconFileNameWithoutExtension;

		return iconId
			.replace(REGEX.WHITESPACE, CONFIG.ID_SEPARATOR)
			.toLowerCase()
			.replace(REGEX.DOTS, CONFIG.ID_SEPARATOR);
	}

	static normalizeSvgContent(rawSvgContent: string, monochromeColors: string): string {
		let svgContent = rawSvgContent.replace(REGEX.SVG_DIMENSIONS, '');
		
		// Replace user-defined monochrome colors with currentColor
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
		asyncFn: (item: T) => Promise<U>
	): Promise<U[]> {
		const results: U[] = [];

		for (const item of items) {
			const result = await asyncFn(item);
			results.push(result);

			// Yield to the main thread to keep the UI responsive
			await new Promise(resolve => activeWindow.setTimeout(resolve, 0));
		}

		return results;
	}
}
