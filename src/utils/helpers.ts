import { REGEX, CONFIG } from './constants';
import { IconFile } from '../types';

export class HelperUtils {
	static generateIconId(icon: IconFile): string {
		const iconFileNameWithoutExtension = icon.name.substring(0, icon.name.lastIndexOf('.'));
		let iconId = icon.prefix ?
			`${icon.prefix}${CONFIG.ID_SEPARATOR}${iconFileNameWithoutExtension}` :
			iconFileNameWithoutExtension;

		return iconId
			.replace(REGEX.WHITESPACE, CONFIG.ID_SEPARATOR)
			.toLowerCase()
			.replace(REGEX.DOTS, CONFIG.ID_SEPARATOR);
	}

	static normalizeSvgContent(rawSvgContent: string): string {
		let svgContent = rawSvgContent.replace(REGEX.SVG_DIMENSIONS, '');
		svgContent = svgContent.replace(REGEX.SVG_COLORS, '$1="currentColor"');

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

	static async runPromisesInBatches<T, U>(
		items: T[],
		asyncFn: (item: T) => Promise<U>,
		batchSize: number
	): Promise<U[]> {
		const results: U[] = [];

		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, i + batchSize);
			const promises = batch.map(asyncFn);
			const batchResults = await Promise.all(promises);
			results.push(...batchResults);
		}

		return results;
	}
}
