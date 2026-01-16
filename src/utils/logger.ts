export class Logger {
    private debugMode: boolean;
    private prefix: string;

    constructor(debugMode: boolean, prefix: string = '') {
        this.debugMode = debugMode;
        this.prefix = prefix ? `[${prefix}] ` : '';
    }

    debug(...args: unknown[]) {
        if (this.debugMode) {
            console.debug(this.prefix, ...args);
        }
    }

    warn(...args: unknown[]) {
        console.warn(this.prefix, ...args);
    }

    error(...args: unknown[]) {
        console.error(this.prefix, ...args);
    }

    setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }
}
