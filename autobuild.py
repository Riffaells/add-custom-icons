#!/usr/bin/env python3
"""
Automatic sync script for Obsidian plugin development.
Watches for changes in build/ and copies files to the plugin folder in Obsidian.
"""

import shutil
import time
import argparse
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from rich.console import Console
from rich.panel import Panel

console = Console()


class PluginSyncHandler(FileSystemEventHandler):
    def __init__(self, source_dir: Path, obsidian_vault_path: Path, plugin_id: str):
        self.source_dir = source_dir
        self.build_dir = source_dir / "build"
        self.plugin_dir = obsidian_vault_path / ".obsidian" / "plugins" / plugin_id

        # Files to sync (taken from build/)
        self.sync_files = [
            "main.js",
            "styles.css",
            "manifest.json",
        ]

        console.print(Panel.fit(
            f"[cyan]Plugin:[/cyan]  {plugin_id}\n"
            f"[cyan]Build:[/cyan]   {self.build_dir}\n"
            f"[cyan]Vault:[/cyan]   {self.plugin_dir}",
            title="[bold blue]Obsidian Plugin Sync[/bold blue]",
            border_style="blue",
        ))

        # Create plugin directory if it doesn't exist
        self.plugin_dir.mkdir(parents=True, exist_ok=True)

        # Initial sync
        self._sync_all()

    # ------------------------------------------------------------------ #
    #  Watchdog callbacks                                                  #
    # ------------------------------------------------------------------ #

    def on_modified(self, event):
        if event.is_directory:
            return
        self._handle_event(event.src_path, "🔄", "yellow")

    def on_created(self, event):
        if event.is_directory:
            return
        self._handle_event(event.src_path, "✨", "green")

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                    #
    # ------------------------------------------------------------------ #

    def _handle_event(self, src_path: str, icon: str, color: str):
        file_path = Path(src_path)

        # Only care about files inside build/
        try:
            relative_path = file_path.relative_to(self.build_dir)
        except ValueError:
            return

        if relative_path.name in self.sync_files:
            console.print(f"{icon} [{color}]Changed:[/{color}] {relative_path.name}")
            self._sync_file(file_path, relative_path)

    def _sync_file(self, source_file: Path, relative_path: Path, quiet: bool = False):
        """Copy a single file to the plugin directory."""
        try:
            dest_file = self.plugin_dir / relative_path
            dest_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_file, dest_file)
            if not quiet:
                console.print(f"   ✅ [green]{relative_path}[/green]")
        except Exception as e:
            console.print(f"   ❌ [red]{relative_path}: {e}[/red]")

    def _sync_all(self):
        """Full sync of all files from build/."""
        if not self.build_dir.exists():
            console.print(
                "⚠️  [yellow]build/ directory not found.[/yellow] "
                "Run [cyan]npm run build[/cyan] or [cyan]npm run dev[/cyan] first."
            )
            return

        console.print("📦 [bold blue]Syncing...[/bold blue]")
        synced = 0

        for file_name in self.sync_files:
            source_file = self.build_dir / file_name
            if source_file.exists():
                self._sync_file(source_file, Path(file_name), quiet=True)
                synced += 1

        console.print(f"✅ [green]Done:[/green] {synced} file(s) copied\n")


# ------------------------------------------------------------------ #
#  Entry point                                                         #
# ------------------------------------------------------------------ #

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync Obsidian plugin from build/ to vault"
    )
    parser.add_argument(
        "--vault", "-v", required=True,
        help="Path to Obsidian vault"
    )
    parser.add_argument(
        "--plugin-id", "-p", default="add-custom-icons",
        help="Plugin ID (default: add-custom-icons)"
    )
    parser.add_argument(
        "--source", "-s", default=".",
        help="Path to plugin source directory (default: current folder)"
    )
    args = parser.parse_args()

    source_dir = Path(args.source).resolve()
    vault_path = Path(args.vault).resolve()

    if not source_dir.exists():
        console.print(f"❌ [red]Source directory not found:[/red] {source_dir}")
        return 1

    if not vault_path.exists():
        console.print(f"❌ [red]Vault not found:[/red] {vault_path}")
        return 1

    event_handler = PluginSyncHandler(source_dir, vault_path, args.plugin_id)

    observer = Observer()
    observer.schedule(event_handler, str(source_dir), recursive=True)

    try:
        observer.start()
        console.print("👀 [green]Watching for changes[/green] (Ctrl+C to stop)\n")

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        console.print("\n🛑 [yellow]Stopping...[/yellow]")
        observer.stop()

    observer.join()
    console.print("✅ [green]Sync stopped[/green]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
