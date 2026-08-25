import { Notice, Setting, SettingDefinitionPage, SettingDefinitionRender, TextComponent } from 'obsidian';
import { HelperUtils } from '../../../utils/helpers';
import { t } from '../../../lang/helpers';
import { SettingsContext, SettingsKey } from './types';
import { denseRow } from './shared';

export function colorsPage(ctx: SettingsContext): SettingDefinitionPage<SettingsKey> {
	const saved = HelperUtils.parseColorList(ctx.plugin.settings.monochromeColors);
	// The draft row lives only in the rendered list: it is appended here and
	// written into `saved` (and to disk) once it holds a valid colour.
	const rows = ctx.pendingColor ? [...saved, ''] : saved;

	return {
		type: 'page',
		name: t('settings.colors.name'),
		desc: t('settings.colors.desc'),
		displayValue: () => String(saved.length),
		items: [
			{
				type: 'list',
				heading: t('settings.colors.header'),
				cls: 'aci-colors-list',
				emptyState: t('settings.colors.empty'),
				items: rows.map((_, index) => colorRow(ctx, rows, index)),
				onReorder: (oldIndex, newIndex) => {
					const [moved] = rows.splice(oldIndex, 1);
					rows.splice(newIndex, 0, moved);
					// Each rendered row edits `rows[index]` through a captured
					// index, so the rows have to be rebuilt against the new
					// order - otherwise the next edit lands on the wrong entry.
					void saveColors(ctx, rows).then(() => ctx.update());
				},
				onDelete: (index) => {
					// Deleting the draft row just drops it - nothing was saved yet.
					if (ctx.pendingColor && index === rows.length - 1) {
						ctx.pendingColor = false;
						ctx.update();
						return;
					}
					rows.splice(index, 1);
					void saveColors(ctx, rows).then(() => ctx.update());
				},
				addItem: {
					name: t('buttons.add'),
					action: () => {
						ctx.pendingColor = true;
						ctx.focusColorIndex = rows.length;
						ctx.update();
					},
				},
			},
		],
	};
}

function colorRow(ctx: SettingsContext, rows: string[], index: number): SettingDefinitionRender {
	const value = rows[index] ?? '';
	const isDraft = value === '';

	return {
		// Rows carry no label - the swatch and the input are the whole row -
		// so the colour itself is what the group's search has to match on.
		name: '',
		aliases: value ? [value] : [],
		render: (setting: Setting) => {
			const controlEl = denseRow(setting);

			const swatch = controlEl.createSpan({ cls: 'aci-color-swatch' });
			swatch.style.backgroundColor = value || 'transparent';

			const input = new TextComponent(controlEl);
			input.setPlaceholder(t('settings.colors.placeholder'));
			input.setValue(value);
			input.inputEl.addClass('aci-color-input');

			const commit = async (): Promise<void> => {
				const next = input.getValue().trim();
				if (next === value) return;

				if (!next) {
					// Clearing the field is not how you delete an entry (the
					// row's own delete button is) - restore the old value.
					if (!isDraft) {
						new Notice(t('settings.colors.emptyError'));
						input.setValue(value);
					}
					return;
				}
				if (!HelperUtils.isValidColor(next)) {
					new Notice(t('settings.colors.invalidFormat'));
					input.setValue(value);
					return;
				}
				if (rows.some((color, i) => i !== index && color.toLowerCase() === next.toLowerCase())) {
					new Notice(t('settings.colors.existsError'));
					input.setValue(value);
					return;
				}

				rows[index] = next;
				await saveColors(ctx, rows);
				swatch.style.backgroundColor = next;

				// A draft row that just became real changes the list structure
				// (delete indices, the draft flag) - rebuild instead of patching.
				if (isDraft) {
					ctx.pendingColor = false;
					ctx.update();
				}
			};

			// Commit on blur/Enter, not per keystroke: validation would reject
			// every half-typed value ("#0", "bla") on the way to a valid one.
			input.inputEl.addEventListener('change', () => { void commit(); });
			input.inputEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') input.inputEl.blur();
			});

			if (ctx.focusColorIndex === index) {
				ctx.focusColorIndex = null;
				// The row isn't in the document yet while `render` runs.
				window.setTimeout(() => input.inputEl.focus(), 0);
			}
		},
	};
}

async function saveColors(ctx: SettingsContext, rows: string[]): Promise<void> {
	// A draft row is still an empty string here; it must not survive into the
	// stored comma-separated list.
	ctx.plugin.settings.monochromeColors = rows.filter(color => color.length > 0).join(',');
	await ctx.plugin.saveSettings();
}
