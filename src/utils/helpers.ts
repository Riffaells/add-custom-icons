import { IconFile } from '../types';
import { generateIconId, resetIdRegistry, registerExistingId, cleanFolderName } from './iconId';
import { normalizeSvgContent, clearSvgNormalizerCaches } from './svg/svgNormalizer';
import { extractSvgColors } from './svg/svgColorExtraction';
import { parseColorList, isValidColor, clearColorMemo } from './svg/colorMemo';

/**
 * Thin facade over the SVG/icon-ID utilities split across utils/iconId.ts and
 * utils/svg/* - kept so callers in services/ and ui/ don't need to know about
 * that internal module layout.
 */
export class HelperUtils {
	/** Call before each full icon-load pass to reset collision tracking */
	static resetIdRegistry(): void {
		resetIdRegistry();
	}

	/** Releases all cached state held by the underlying modules. Called on plugin unload. */
	static clearCaches(): void {
		resetIdRegistry();
		clearColorMemo();
		clearSvgNormalizerCaches();
	}

	static generateIconId(icon: IconFile): string {
		return generateIconId(icon);
	}

	/** Registers an ID reused from the cache so collision detection sees it during this pass */
	static registerExistingId(id: string, path: string): void {
		registerExistingId(id, path);
	}

	static normalizeSvgContent(rawSvgContent: string, monochromeColors: string): string {
		return normalizeSvgContent(rawSvgContent, monochromeColors);
	}

	/** Extracts fixed fill/stroke colors from an SVG, for the icon-fix dialog. */
	static extractSvgColors(rawSvgContent: string): string[] {
		return extractSvgColors(rawSvgContent);
	}

	static isValidColor(color: string): boolean {
		return isValidColor(color);
	}

	/** Splits the comma-separated monochrome color list, preserving original casing */
	static parseColorList(monochromeColors: string): string[] {
		return parseColorList(monochromeColors);
	}

	static cleanFolderName(folderName: string): string {
		return cleanFolderName(folderName);
	}
}
