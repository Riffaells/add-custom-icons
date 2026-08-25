import { setIcon } from 'obsidian';

export function createIconEl(iconId: string): HTMLElement {
	const iconEl = createEl('span', { cls: 'setting-item-icon' });
	setIcon(iconEl, iconId);
	return iconEl;
}
