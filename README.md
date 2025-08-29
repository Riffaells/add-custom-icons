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
│       └── SettingsTab.ts    # Settings interface
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

## Settings

- **Enable Auto Restart**: Automatically restart plugins after loading icons
- **Restart Target**: What to restart (selected plugins, entire Obsidian, or nothing)
- **Plugin Selection**: Convenient interface for adding/removing plugins from restart list

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
