export const enTranslations = {
  "settings": {
    "title": "Add Custom Icons",
    "iconsManagement": {
      "title": "Icons Management",
      "folderPath": "Icons Folder",
      "folderDesc": "Path to SVG icons folder",
      "openFolder": "Open Folder",
      "reloadIcons": "Reload Icons",
      "iconsLoaded": "Icons loaded: {count}",
      "folderCreated": "Folder created. Path copied: {path}",
      "pathCopied": "Path copied to clipboard: {path}"
    },
    "autoRestart": {
      "title": "Auto Restart"
    },
    "enableAutoRestart": {
      "name": "Enable auto restart",
      "desc": "Automatically restart plugins after loading icons"
    },
    "restartTarget": {
      "name": "Restart target",
      "desc": "What to restart after loading icons"
    },
    "pluginSelection": {
      "name": "Plugin Selection",
      "desc": "Select which plugins to restart after loading icons",
      "addPlugin": "Add Plugin",
      "removePlugin": "Remove",
      "noPlugins": "No plugins selected",
      "selectedCount": "Selected plugins: {count}",
      "noPluginsSelected": "No plugins selected. Click \"Configure Plugins\" to add.",
      "manageList": "Manage List",
      "manageDesc": "Add or remove plugins from restart list",
      "configurePlugins": "Configure Plugins",
      "selectPluginsTitle": "Select Plugins for Restart",
      "selectPluginsDesc": "Choose plugins that will be automatically restarted after loading icons.",
      "noPluginsFound": "No other plugins found",
      "pluginDisabled": "(disabled)"
    },
    "options": {
      "plugins": "Selected Plugins",
      "obsidian": "Entire Obsidian",
      "none": "Nothing"
    },
    "info": {
      "title": "Information",
      "plugins": "Restart only selected plugins",
      "obsidian": "Restart entire Obsidian application",
      "none": "Just load icons without restart",
      "supportedFormats": "Supported formats: SVG",
      "folderStructure": "Folder structure: icons/ (subfolders supported)",
      "naming": "Naming: File names become icon IDs"
    },
    "buttons": {
      "cancel": "Cancel",
      "done": "Done",
      "add": "Add",
      "remove": "Remove"
    },
    "debug": {
      "title": "Debug",
      "enableDebug": {
        "name": "Debug Mode",
        "desc": "Enable detailed logging in developer console"
      }
    }
  },
  "commands": {
    "reloadIcons": "Reload Custom Icons"
  },
  "notices": {
    "loadingInProgress": "Icon loading already in progress",
    "startingReload": "Starting icon reload...",
    "iconsLoaded": "Loaded {count} icons",
    "iconsLoadedWithChanges": "Loaded {count} icons ({changed} changed)",
    "errorReloading": "Error reloading icons",
    "restartingObsidian": "Restarting Obsidian...",
    "manualRestart": "Please restart Obsidian manually",
    "pluginAdded": "Plugin added to restart list",
    "pluginRemoved": "Plugin removed from restart list"
  }
};
