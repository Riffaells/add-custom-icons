// Russian

export default {
	// Settings
	SETTINGS_TITLE: "Добавить пользовательские иконки",
	ICONS_MANAGEMENT_HEADER: "Управление иконками",
	ICONS_MANAGEMENT_TITLE: "Управление иконками",
	FOLDER_PATH: "Папка с иконками",
	FOLDER_DESC: "Путь к папке с SVG иконками",
	ICONS_PATH_TYPE_NAME: "Расположение иконок",
	ICONS_PATH_TYPE_DESC: "Выберите, где хранить пользовательские иконки",
	CUSTOM_PATH_NAME: "Пользовательский путь",
	CUSTOM_PATH_DESC: "Введите путь относительно корня хранилища (например, icons/)",
	CUSTOM_PATH_PLACEHOLDER: "icons/",
	PATH_TYPE_PLUGIN: "Папка плагина",
	PATH_TYPE_VAULT: "Папка хранилища",
	PATH_TYPE_CUSTOM: "Пользовательский путь",
	OPEN_FOLDER: "Открыть папку",
	RELOAD_ICONS: "Перезагрузить иконки",
	ICONS_LOADED: "Загружено иконок: {count}",
	FOLDER_CREATED: "Папка создана. Путь скопирован: {path}",
	PATH_COPIED: "Путь скопирован в буфер обмена: {path}",
	ERROR_OPENING_FOLDER: "Не удалось открыть папку с иконками",
	
	// Icon Browser
	ICONS_BROWSER_HEADER: "Просмотр иконок",
	ICONS_BROWSER_DESC: "Просмотр и управление загруженными иконками. Оптимизация исправит конфликты ID и удалит лишние метаданные.",
	SEARCH_ICONS_PLACEHOLDER: "Поиск иконок...",
	OPTIMIZE: "Оптимизировать",
	OPTIMIZE_TOOLTIP: "Исправить ID и удалить размеры",
	NO_ICONS: "Иконки не найдены",
	
	// Monochrome Colors
	MONOCHROME_COLORS_NAME: "Монохромные цвета",
	MONOCHROME_COLORS_DESC: "Список цветов через запятую (например, #000, black), которые будут преобразованы в currentColor для поддержки тем.",
	COLOR_INPUT_PLACEHOLDER: "#000000 или black",
	NO_COLORS_ADDED: "Цвета не добавлены",
	EDIT_COLOR_TOOLTIP: "Редактировать {color}",
	REMOVE_COLOR_TOOLTIP: "Удалить {color}",
	COLOR_REMOVE_FAILED: "Не удалось удалить цвет",
	COLOR_EMPTY_ERROR: "Цвет не может быть пустым",
	COLOR_EXISTS_ERROR: "Этот цвет уже существует",
	COLOR_INVALID_FORMAT: "Неверный формат цвета. Используйте hex (#000000) или название (black)",
	COLOR_OPERATION_FAILED: "Операция с цветом не удалась",
	
	// Auto Restart
	AUTO_RESTART_HEADER: "Автоперезапуск",
	AUTO_RESTART_TITLE: "Автоперезапуск",
	ENABLE_AUTO_RESTART_NAME: "Включить автоперезапуск",
	ENABLE_AUTO_RESTART_DESC: "Автоматически перезапускать плагины после загрузки иконок",
	RESTART_TARGET_NAME: "Цель перезапуска",
	RESTART_TARGET_DESC: "Что перезапускать после загрузки иконок",
	
	// Plugin Selection
	PLUGIN_SELECTION_HEADER: "Выбор плагинов",
	PLUGIN_SELECTION_NAME: "Выбор плагинов",
	PLUGIN_SELECTION_DESC: "Выберите плагины для перезапуска после загрузки иконок",
	ADD_PLUGIN: "Добавить плагин",
	REMOVE_PLUGIN: "Удалить",
	REMOVE_PLUGIN_TOOLTIP: "Удалить",
	NO_PLUGINS: "Плагины не выбраны",
	SELECTED_COUNT: "Выбрано плагинов: {count}",
	NO_PLUGINS_SELECTED: "Плагины не выбраны. Нажмите \"Настроить плагины\" для добавления.",
	MANAGE_LIST: "Управление списком",
	MANAGE_DESC: "Добавить или удалить плагины из списка перезапуска",
	CONFIGURE_PLUGINS: "Настроить плагины",
	SELECT_PLUGINS_TITLE: "Выбрать плагины для перезапуска",
	SELECT_PLUGINS_DESC: "Выберите плагины, которые будут автоматически перезапускаться после загрузки иконок.",
	SEARCH_PLUGINS_PLACEHOLDER: "Поиск плагинов...",
	NO_PLUGINS_FOUND: "Другие плагины не найдены",
	NO_RESULTS_FOUND: "Ничего не найдено",
	PLUGIN_DISABLED: "(отключен)",
	
	// Options
	OPTIONS_PLUGINS: "Выбранные плагины",
	OPTIONS_OBSIDIAN: "Весь Obsidian",
	OPTIONS_NONE: "Ничего",
	
	// Info
	INFO_HEADER: "Информация",
	INFO_PLUGINS: "Перезапускать только выбранные плагины",
	INFO_OBSIDIAN: "Перезапускать всё приложение Obsidian",
	INFO_NONE: "Просто загрузить иконки без перезапуска",
	SUPPORTED_FORMATS_NAME: "Поддерживаемые форматы",
	SUPPORTED_FORMATS: "SVG",
	FOLDER_STRUCTURE_NAME: "Структура папок",
	FOLDER_STRUCTURE: "icons/ (подпапки поддерживаются)",
	NAMING_NAME: "Соглашение об именовании",
	NAMING: "Имена файлов становятся ID иконок",
	
	// Buttons
	CANCEL: "Отмена",
	DONE: "Готово",
	ADD: "Добавить",
	SAVE: "Сохранить",
	REMOVE: "Удалить",
	
	// Debug
	DEBUG_HEADER: "Отладка",
	DEBUG_TITLE: "Отладка",
	DEBUG_MODE_NAME: "Режим отладки",
	DEBUG_MODE_DESC: "Включить подробное логирование в консоли разработчика",
	
	// Commands
	COMMAND_RELOAD_ICONS: "Перезагрузить пользовательские иконки",
	COMMAND_MEMORY_STATS: "Показать статистику памяти иконок",
	
	// Notices
	LOADING_IN_PROGRESS: "Загрузка иконок уже выполняется",
	STARTING_RELOAD: "Начинаем перезагрузку иконок...",
	ICONS_LOADED_COUNT: "Загружено {count} иконок",
	ICONS_LOADED_WITH_CHANGES: "Загружено {count} иконок ({changed} изменено)",
	ERROR_RELOADING: "Ошибка при перезагрузке иконок",
	ERROR_REMOVING_PLUGIN: "Не удалось удалить плагин из списка",
	RESTARTING_OBSIDIAN: "Перезапускаем Obsidian...",
	MANUAL_RESTART: "Пожалуйста, перезапустите Obsidian вручную",
	PLUGIN_ADDED: "Плагин добавлен в список перезапуска",
	PLUGIN_REMOVED: "Плагин удален из списка перезапуска"
};
