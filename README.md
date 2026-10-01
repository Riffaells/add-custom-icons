# Add Custom Icons Plugin

A plugin for Obsidian that loads custom SVG icons from the `icons` folder and automatically restarts selected plugins. The `icons` folder can be located either in `.obsidian` or in the plugin root.

## Project Structure

```
├── main.ts                    # Main plugin file
├── manifest.json              # Plugin manifest
├── icons/                     # SVG icons folder
│   └── example-icon.svg       # Example icon
├── src/
│   ├── lang/                  # Built-in translations
│   │   ├── en.ts             # English translations
│   │   ├── ru.ts             # Russian translations
│   │   └── index.ts          # Translation exports
│   ├── types/
│   │   └── index.ts          # TypeScript types and interfaces
│   ├── utils/
│   │   ├── constants.ts      # Constants and default settings
│   │   └── helpers.ts        # Helper functions
│   ├── services/
│   │   ├── IconLoader.ts     # Icon loading service
│   │   ├── PluginManager.ts  # Plugin management service
│   │   └── I18nService.ts    # Localization service
│   └── ui/
│       ├── SettingsTab.ts    # Settings interface (1.13 API + legacy display())
│       └── settings/         # Declarative setting definitions (Obsidian 1.13+)
└── autobuild.py              # Development sync script
```

## Features

- **SVG Icon Loading**: Automatically scans the `icons` folder and loads all SVG files
- **Caching**: Uses cache for fast loading of unchanged icons
- **SVG Normalization**: Automatically adapts icons to Obsidian theme
- **Automatic Restart**: Can restart selected plugins or entire Obsidian
- **Recursive Scanning**: Supports subfolders in the icons directory
- **Batch Processing**: Processes icons in batches for better performance
- **Multilingual**: Support for Russian and English with auto-detection
- **Modern UI**: Compact settings interface with convenient plugin management
- **Built-in Translations**: All translations are compiled into the plugin code

## Usage

1. Place SVG files in the `icons` folder in the plugin root or in the .obsidian folder
2. The plugin will automatically load icons on startup
3. Use the "Reload custom icons" command for manual reload
4. Configure automatic restart in plugin settings

### Using with Iconic

Some plugins read Obsidian's icon list once, at the moment they are loaded. [Iconic](https://github.com/gfxholo/iconic) is one of them: an icon missing from that list does not show up in its icon picker and is not drawn at all.

So whether Iconic sees your icons depends on which of the two plugins Obsidian loads first, and that follows the order they were enabled in:

- **Add Custom Icons loads first**: nothing to configure, Iconic picks the icons up when it loads.
- **Iconic loads first**: turn on **Enable auto restart**, set **Restart target** to *Selected Plugins* and keep `iconic` in the list. Iconic is then reloaded once after startup, and again whenever the icons change.

## Settings

- **Icons Location**: plugin folder, vault folder (`.obsidian/icons`) or a custom path
- **Monochrome Colors**: colours replaced with `currentColor` so icons follow the theme
- **Enable Auto Restart**: Automatically restart plugins after loading icons
- **Restart Target**: What to restart (selected plugins, entire Obsidian, or nothing)
- **Plugin Selection**: Convenient interface for adding/removing plugins from restart list
- **Debug Mode**: detailed logging in the developer console

On Obsidian 1.13+ the tab is built declaratively (`getSettingDefinitions()`), so the plugin's
settings show up in Obsidian's global settings search; older versions get the previous
`display()` interface unchanged.

## Development

```bash
# Install dependencies
npm install

# Build for development
npm run dev

# Build for production
npm run build
```

### Automatic Build and Sync

For convenient development, a Python auto-build script is included:

```bash
# Install Python dependencies
pip install watchdog rich

# Run auto-build
python autobuild.py --vault "path/to/obsidian/vault"
```

The script automatically monitors changes in `main.js`, `styles.css`, and `manifest.json`, copying them to the plugin folder in Obsidian.

## Architecture

The plugin is divided into logical modules:

- **main.ts**: Main plugin class, coordinates all services
- **IconLoader**: Handles icon loading, caching, and processing
- **PluginManager**: Manages plugin and Obsidian restarts
- **SettingsTab**: User interface for settings
- **I18nService**: Localization service with built-in translations
- **types**: Common TypeScript types
- **utils**: Constants and helper functions

## Translation System

The plugin uses a built-in translation system:
- All translations are compiled into the main plugin code
- No external language files needed
- Automatic language detection based on Obsidian settings
- Currently supports English and Russian

## License

MIT License - see LICENSE file for details.
