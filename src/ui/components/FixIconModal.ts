import { App, Modal, Notice, Setting, addIcon } from 'obsidian';
import AddCustomIconsPlugin from '../../../main';
import { HelperUtils } from '../../utils/helpers';
import { t } from '../../lang/helpers';

/**
 * Dialog that lists the fixed colors found inside an icon's SVG source and
 * lets the user pick which of them should be converted to currentColor. The
 * preview re-renders from the raw SVG on every toggle so the user sees the
 * result before committing. Applying updates only this one icon directly via
 * addIcon() — no vault-wide rescan — and persists the color(s) in settings so
 * future loads pick them up too.
 */
export class FixIconModal extends Modal {
    private plugin: AddCustomIconsPlugin;
    private iconPath: string;
    private iconId: string;
    private onApplied: () => void;
    private selected = new Set<string>();
    private rawSvg = '';
    private previewEl: HTMLElement;

    constructor(
        app: App,
        plugin: AddCustomIconsPlugin,
        iconPath: string,
        iconId: string,
        onApplied: () => void
    ) {
        super(app);
        this.plugin = plugin;
        this.iconPath = iconPath;
        this.iconId = iconId;
        this.onApplied = onApplied;
    }

    onOpen(): void {
        void this.renderContent();
    }

    private async renderContent(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('fix-icon-modal');

        new Setting(contentEl)
            .setName(t('fixModal.title', { id: this.iconId }))
            .setHeading();

        contentEl.createEl('p', {
            text: t('fixModal.desc'),
            cls: 'setting-item-description'
        });

        try {
            this.rawSvg = await this.app.vault.adapter.read(this.iconPath);
        } catch {
            new Notice(t('fixModal.readError'));
            this.close();
            return;
        }

        this.previewEl = contentEl.createDiv({ cls: 'fix-icon-preview' });
        this.updatePreview();

        const colors = HelperUtils.extractSvgColors(this.rawSvg);
        if (colors.length === 0) {
            contentEl.createDiv({
                text: t('fixModal.noColors'),
                cls: 'setting-item-description'
            });
            return;
        }

        const existing = new Set(
            HelperUtils.parseColorList(this.plugin.settings.monochromeColors)
                .map(c => c.toLowerCase())
        );

        const list = contentEl.createDiv({ cls: 'fix-icon-colors' });
        for (const color of colors) {
            const row = new Setting(list).setName(color);

            const swatch = createSpan({ cls: 'fix-icon-swatch' });
            swatch.style.backgroundColor = color;
            row.nameEl.prepend(swatch);

            if (existing.has(color.toLowerCase())) {
                row.setDesc(t('fixModal.alreadyAdded'));
                row.addToggle(toggle => toggle.setValue(true).setDisabled(true));
            } else {
                row.addToggle(toggle =>
                    toggle.setValue(false).onChange(value => {
                        if (value) {
                            this.selected.add(color);
                        } else {
                            this.selected.delete(color);
                        }
                        this.updatePreview();
                    })
                );
            }
        }

        new Setting(contentEl)
            .addButton(btn =>
                btn.setButtonText(t('buttons.cancel')).onClick(() => this.close())
            )
            .addButton(btn =>
                btn
                    .setButtonText(t('fixModal.apply'))
                    .setCta()
                    .onClick(() => {
                        void this.applyFix().catch(() => {
                            new Notice(t('fixModal.applyFailed'));
                        });
                    })
            );
    }

    /** Builds the color list that would be active if the current toggles were applied */
    private tentativeColorsString(): string {
        const current = HelperUtils.parseColorList(this.plugin.settings.monochromeColors);
        const currentSet = new Set(current.map(c => c.toLowerCase()));
        const additions = Array.from(this.selected).filter(c => !currentSet.has(c.toLowerCase()));
        return [...current, ...additions].join(',');
    }

    /** Re-normalizes the raw SVG with the tentative color list and renders it directly */
    private updatePreview(): void {
        const normalized = HelperUtils.normalizeSvgContent(this.rawSvg, this.tentativeColorsString());
        this.previewEl.empty();
        if (normalized) {
            this.previewEl.innerHTML = normalized;
        }
    }

    private async applyFix(): Promise<void> {
        if (this.selected.size === 0) {
            this.close();
            return;
        }

        const current = HelperUtils.parseColorList(this.plugin.settings.monochromeColors);
        const currentSet = new Set(current.map(c => c.toLowerCase()));

        let addedCount = 0;
        for (const color of this.selected) {
            if (!currentSet.has(color.toLowerCase())) {
                current.push(color);
                addedCount++;
            }
        }

        this.plugin.settings.monochromeColors = current.join(',');
        await this.plugin.saveSettings();

        // Update just this one icon in Obsidian's registry directly, instead of
        // triggering a full folder rescan — the fix should feel instant even in
        // vaults with hundreds of icons. Other icons pick up the new color list
        // the next time they're loaded (background scan, manual reload, restart).
        const normalized = HelperUtils.normalizeSvgContent(this.rawSvg, current.join(','));
        if (normalized) {
            addIcon(this.iconId, normalized);
        }

        this.close();
        new Notice(t('fixModal.applied', { count: addedCount }));
        this.onApplied();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
