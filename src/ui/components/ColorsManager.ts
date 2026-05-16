import { Setting, TextComponent, ExtraButtonComponent, Notice } from 'obsidian';
import { t } from '../../lang/helpers';

export class ColorsManager {
    private containerEl: HTMLElement;
    private title: string;
    private description: string;
    private colors: string[];
    private onColorsChange: (colors: string[]) => Promise<void>;
    private tagsListEl: HTMLElement;
    private inputComponent: TextComponent;
    private addButton: HTMLButtonElement | null = null;
    private editingColor: string | null = null;

    constructor(
        containerEl: HTMLElement,
        title: string,
        description: string,
        colors: string[],
        onColorsChange: (colors: string[]) => Promise<void>
    ) {
        this.containerEl = containerEl;
        this.title = title;
        this.description = description;
        this.colors = [...colors];
        this.onColorsChange = onColorsChange;
    }

    render(): void {
        const setting = new Setting(this.containerEl)
            .setName(this.title)
            .setDesc(this.description);

        const controlsContainer = setting.controlEl.createDiv('tags-manager-controls');
        
        this.createInputRow(controlsContainer);
        this.tagsListEl = controlsContainer.createDiv('tags-list');
        this.renderColorsList();
    }

    private createInputRow(container: HTMLElement): void {
        const inputRow = container.createDiv('tags-input-row');
        const inputWrapper = inputRow.createDiv('tags-input-wrapper');
        
        this.inputComponent = new TextComponent(inputWrapper);
        this.inputComponent.setPlaceholder(t('COLOR_INPUT_PLACEHOLDER'));
        
        this.inputComponent.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void (this.editingColor ? this.saveEdit() : this.addColor())
                    .catch(() => {
                        new Notice(t('COLOR_OPERATION_FAILED'));
                    });
            } else if (e.key === 'Escape' && this.editingColor) {
                this.cancelEdit();
            }
        });

        this.addButton = inputRow.createEl('button', { cls: 'mod-cta' });
        this.addButton.addEventListener('click', () => {
            void (this.editingColor ? this.saveEdit() : this.addColor())
                .catch(() => {
                    new Notice(t('COLOR_OPERATION_FAILED'));
                });
        });
        this.updateButtonText();
    }

    private updateButtonText(): void {
        if (this.addButton) {
            this.addButton.textContent = this.editingColor ? t('SAVE') : t('ADD');
        }
    }

    /**
     * Validates color format (hex or named color)
     * @param color - Color string to validate
     * @returns true if valid, false otherwise
     */
    private isValidColor(color: string): boolean {
        // Check if it's a hex color (#RGB, #RRGGBB, #RRGGBBAA)
        if (/^#[0-9A-Fa-f]{3,8}$/.test(color)) {
            return true;
        }
        // Check if it's a named color (letters only)
        if (/^[a-z]+$/i.test(color)) {
            return true;
        }
        return false;
    }

    private renderColorsList(): void {
        this.tagsListEl.empty();
        
        if (this.colors.length === 0) {
            const emptyMsg = this.tagsListEl.createDiv('tags-empty-message');
            emptyMsg.textContent = t('NO_COLORS_ADDED');
            return;
        }

        this.colors.forEach(color => this.renderColorTag(color));
    }

    private renderColorTag(color: string): void {
        const tagEl = this.tagsListEl.createDiv('tag-item');
        tagEl.createSpan({ cls: 'tag-text', text: color });

        const editBtn = new ExtraButtonComponent(tagEl)
            .setIcon('pencil')
            .setTooltip(t('EDIT_COLOR_TOOLTIP', { color }))
            .onClick(() => this.startEdit(color));
        editBtn.extraSettingsEl.addClass('tag-action-btn');

        const removeBtn = new ExtraButtonComponent(tagEl)
            .setIcon('cross')
            .setTooltip(t('REMOVE_COLOR_TOOLTIP', { color }))
            .onClick(async () => {
                try {
                    await this.removeColor(color);
                } catch {
                    new Notice(t('COLOR_REMOVE_FAILED'));
                }
            });
        removeBtn.extraSettingsEl.addClass('tag-action-btn', 'tag-remove-btn');
    }

    private startEdit(color: string): void {
        this.editingColor = color;
        this.inputComponent.setValue(color);
        this.inputComponent.inputEl.focus();
        this.inputComponent.inputEl.select();
        this.updateButtonText();
    }

    private cancelEdit(): void {
        this.editingColor = null;
        this.inputComponent.setValue('');
        this.updateButtonText();
    }

    private async saveEdit(): Promise<void> {
        if (!this.editingColor) return;
        
        const newValue = this.inputComponent.getValue().trim();
        if (!newValue) {
            new Notice(t('COLOR_EMPTY_ERROR'));
            return;
        }

        if (!this.isValidColor(newValue)) {
            new Notice(t('COLOR_INVALID_FORMAT'));
            return;
        }

        if (this.colors.includes(newValue) && newValue !== this.editingColor) {
            new Notice(t('COLOR_EXISTS_ERROR'));
            return;
        }

        const index = this.colors.indexOf(this.editingColor);
        if (index !== -1) {
            this.colors[index] = newValue;
            await this.onColorsChange(this.colors);
            this.renderColorsList();
        }
        this.cancelEdit();
    }

    private async addColor(): Promise<void> {
        const color = this.inputComponent.getValue().trim();
        if (!color) return;

        if (!this.isValidColor(color)) {
            new Notice(t('COLOR_INVALID_FORMAT'));
            this.inputComponent.setValue('');
            return;
        }

        if (this.colors.includes(color)) {
            new Notice(t('COLOR_EXISTS_ERROR'));
            this.inputComponent.setValue('');
            return;
        }

        this.colors.push(color);
        this.inputComponent.setValue('');
        await this.onColorsChange(this.colors);
        this.renderColorsList();
    }

    private async removeColor(color: string): Promise<void> {
        this.colors = this.colors.filter(c => c !== color);
        await this.onColorsChange(this.colors);
        this.renderColorsList();
    }
}
