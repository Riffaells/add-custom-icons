// English

export default {
	// Settings
	SETTINGS_TITLE: "Add Custom Icons",
	ICONS_MANAGEMENT_HEADER: "Icons Management",
	ICONS_MANAGEMENT_TITLE: "Icons Management",
	FOLDER_PATH: "Icons Folder",
	FOLDER_DESC: "Path to SVG icons folder",
	ICONS_PATH_TYPE_NAME: "Icons Location",
	ICONS_PATH_TYPE_DESC: "Choose where to store your custom icons",
	CUSTOM_PATH_NAME: "Custom Path",
	CUSTOM_PATH_DESC: "Enter a custom path relative to vault root (e.g., icons/)",
	CUSTOM_PATH_PLACEHOLDER: "icons/",
	PATH_TYPE_PLUGIN: "Plugin Folder",
	PATH_TYPE_VAULT: "Vault Folder",
	PATH_TYPE_CUSTOM: "Custom Path",
	OPEN_FOLDER: "Open Folder",
	RELOAD_ICONS: "Reload Icons",
	ICONS_LOADED: "Icons loaded: {count}",
	FOLDER_CREATED: "Folder created. Path copied: {path}",
	PATH_COPIED: "Path copied to clipboard: {path}",
	ERROR_OPENING_FOLDER: "Failed to open icons folder",
	
	// Icon Browser
	ICONS_BROWSER_HEADER: "Icon Browser",
	ICONS_BROWSER_DESC: "View and manage your loaded icons. Optimizing an icon will fix ID collisions and remove unnecessary metadata.",
	SEARCH_ICONS_PLACEHOLDER: "Search icons...",
	OPTIMIZE: "Optimize",
	OPTIMIZE_TOOLTIP: "Fix IDs and remove dimensions",
	NO_ICONS: "No icons found",
	
	// Monochrome Colors
	MONOCHROME_COLORS_NAME: "Monochrome Colors",
	MONOCHROME_COLORS_DESC: "Comma-separated list of colors (e.g. #000, black) that should be converted to currentColor to support theming.",
	COLOR_INPUT_PLACEHOLDER: "#000000 or black",
	NO_COLORS_ADDED: "No colors added",
	EDIT_COLOR_TOOLTIP: "Edit {color}",
	REMOVE_COLOR_TOOLTIP: "Remove {color}",
	COLOR_REMOVE_FAILED: "Failed to remove color",
	COLOR_EMPTY_ERROR: "Color cannot be empty",
	COLOR_EXISTS_ERROR: "This color already exists",
	COLOR_INVALID_FORMAT: "Invalid color format. Use hex (#000000) or color name (black)",
	COLOR_OPERATION_FAILED: "Color operation failed",
	
	// Auto Restart
	AUTO_RESTART_HEADER: "Auto Restart",
	AUTO_RESTART_TITLE: "Auto Restart",
	ENABLE_AUTO_RESTART_NAME: "Enable auto restart",
	ENABLE_AUTO_RESTART_DESC: "Automatically restart plugins after loading icons",
	RESTART_TARGET_NAME: "Restart target",
	RESTART_TARGET_DESC: "What to restart after loading icons",
	
	// Plugin Selection
	PLUGIN_SELECTION_HEADER: "Plugin Selection",
	PLUGIN_SELECTION_NAME: "Plugin Selection",
	PLUGIN_SELECTION_DESC: "Select which plugins to restart after loading icons",
	ADD_PLUGIN: "Add Plugin",
	REMOVE_PLUGIN: "Remove",
	REMOVE_PLUGIN_TOOLTIP: "Remove",
	NO_PLUGINS: "No plugins selected",
	SELECTED_COUNT: "Selected plugins: {count}",
	NO_PLUGINS_SELECTED: "No plugins selected. Click \"Configure Plugins\" to add.",
	MANAGE_LIST: "Manage List",
	MANAGE_DESC: "Add or remove plugins from restart list",
	CONFIGURE_PLUGINS: "Configure Plugins",
	SELECT_PLUGINS_TITLE: "Select Plugins for Restart",
	SELECT_PLUGINS_DESC: "Choose plugins that will be automatically restarted after loading icons.",
	SEARCH_PLUGINS_PLACEHOLDER: "Search plugins...",
	NO_PLUGINS_FOUND: "No other plugins found",
	NO_RESULTS_FOUND: "No results found",
	PLUGIN_DISABLED: "(disabled)",
	
	// Options
	OPTIONS_PLUGINS: "Selected Plugins",
	OPTIONS_OBSIDIAN: "Entire Obsidian",
	OPTIONS_NONE: "Nothing",
	
	// Info
	INFO_HEADER: "Information",
	INFO_PLUGINS: "Restart only selected plugins",
	INFO_OBSIDIAN: "Restart entire Obsidian application",
	INFO_NONE: "Just load icons without restart",
	SUPPORTED_FORMATS_NAME: "Supported Formats",
	SUPPORTED_FORMATS: "SVG",
	FOLDER_STRUCTURE_NAME: "Folder Structure",
	FOLDER_STRUCTURE: "icons/ (subfolders supported)",
	NAMING_NAME: "Naming Convention",
	NAMING: "File names become icon IDs",
	
	// Buttons
	CANCEL: "Cancel",
	DONE: "Done",
	ADD: "Add",
	SAVE: "Save",
	REMOVE: "Remove",
	
	// Debug
	DEBUG_HEADER: "Debug",
	DEBUG_TITLE: "Debug",
	DEBUG_MODE_NAME: "Debug Mode",
	DEBUG_MODE_DESC: "Enable detailed logging in developer console",
	
	// Commands
	COMMAND_RELOAD_ICONS: "Reload Custom Icons",
	COMMAND_MEMORY_STATS: "Show Icon Memory Statistics",

	// Notices
	LOADING_IN_PROGRESS: "Icon loading already in progress",
	STARTING_RELOAD: "Starting icon reload...",
	ICONS_LOADED_COUNT: "Loaded {count} icons",
	ICONS_LOADED_WITH_CHANGES: "Loaded {count} icons ({changed} changed)",
	ERROR_RELOADING: "Error reloading icons",
	ERROR_REMOVING_PLUGIN: "Failed to remove plugin from list",
	RESTARTING_OBSIDIAN: "Restarting Obsidian...",
	MANUAL_RESTART: "Please restart Obsidian manually",
	PLUGIN_ADDED: "Plugin added to restart list",
	PLUGIN_REMOVED: "Plugin removed from restart list"
};
