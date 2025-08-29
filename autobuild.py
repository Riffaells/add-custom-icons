#!/usr/bin/env python3
"""
Automatic sync script for Obsidian plugin development
Monitors changes in main.js and copies files to the plugin folder in Obsidian
"""

import os
import shutil
import time
import argparse
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import print as rprint

console = Console()

class PluginSyncHandler(FileSystemEventHandler):
    def __init__(self, source_dir, obsidian_vault_path, plugin_id):
        self.source_dir = Path(source_dir)
        self.obsidian_vault_path = Path(obsidian_vault_path)
        self.plugin_id = plugin_id
        self.plugin_dir = self.obsidian_vault_path / ".obsidian" / "plugins" / plugin_id

        # Files to sync
        self.sync_files = [
            "main.js",
            "styles.css",
            "manifest.json"
        ]

        # Folders to sync (removed all folders since translations are now built-in)
        self.sync_folders = []

        # Display settings
        console.print(f"🔧 [cyan]Plugin:[/cyan] {self.plugin_id}")
        console.print(f"📁 [cyan]Source:[/cyan] {self.source_dir}")
        console.print(f"🗃️ [cyan]Vault:[/cyan] {self.plugin_dir}")
        console.print()

        # Create plugin directory if it doesn't exist
        self.plugin_dir.mkdir(parents=True, exist_ok=True)

        # Perform initial sync
        self.sync_all()

    def on_modified(self, event):
        if event.is_directory:
            return

        file_path = Path(event.src_path)
        relative_path = file_path.relative_to(self.source_dir)

        # Check if this file should be synced
        if self.should_sync_file(relative_path):
            console.print(f"🔄 [yellow]{relative_path}[/yellow]")
            self.sync_file(file_path, relative_path)

    def on_created(self, event):
        if event.is_directory:
            return

        file_path = Path(event.src_path)
        relative_path = file_path.relative_to(self.source_dir)

        if self.should_sync_file(relative_path):
            console.print(f"✨ [green]{relative_path}[/green]")
            self.sync_file(file_path, relative_path)

    def should_sync_file(self, relative_path):
        """Check if file should be synced"""
        file_name = relative_path.name

        # Sync main plugin files
        if file_name in self.sync_files:
            return True

        # Sync files in specified folders
        if relative_path.parts[0] in self.sync_folders:
            return True

        return False

    def sync_file(self, source_file, relative_path, quiet=False):
        """Sync individual file"""
        try:
            dest_file = self.plugin_dir / relative_path
            dest_file.parent.mkdir(parents=True, exist_ok=True)

            shutil.copy2(source_file, dest_file)
            if not quiet:
                console.print(f"   ✅ [green]{relative_path}[/green]")

        except Exception as e:
            console.print(f"   ❌ [red]{relative_path}: {e}[/red]")

    def sync_all(self):
        """Perform full sync of all files"""
        console.print("📦 [bold blue]Syncing...[/bold blue]")

        synced_files = 0
        synced_folders = 0

        # Sync main files
        for file_name in self.sync_files:
            source_file = self.source_dir / file_name
            if source_file.exists():
                self.sync_file(source_file, Path(file_name), quiet=True)
                synced_files += 1

        # Sync folders
        for folder_name in self.sync_folders:
            source_folder = self.source_dir / folder_name
            if source_folder.exists():
                self.sync_folder(source_folder, Path(folder_name))
                synced_folders += 1

        console.print(f"✅ [green]Done:[/green] {synced_files} files, {synced_folders} folders")
        console.print()

    def sync_folder(self, source_folder, relative_path):
        """Sync folder recursively"""
        dest_folder = self.plugin_dir / relative_path

        try:
            # Remove old folder if exists
            if dest_folder.exists():
                shutil.rmtree(dest_folder)

            # Copy new folder
            shutil.copytree(source_folder, dest_folder)

        except Exception as e:
            console.print(f"❌ [red]Folder error {relative_path}: {e}[/red]")


def main():
    console.print("🚀 [bold blue]Obsidian Plugin Sync[/bold blue]")
    console.print()

    parser = argparse.ArgumentParser(description="Obsidian plugin synchronization")
    parser.add_argument("--vault", "-v", required=True,
                       help="Path to Obsidian vault")
    parser.add_argument("--plugin-id", "-p", default="add-custom-icons",
                       help="Plugin ID (default: add-custom-icons)")
    parser.add_argument("--source", "-s", default=".",
                       help="Path to plugin source (default: current folder)")

    args = parser.parse_args()

    # Check path existence
    source_dir = Path(args.source).resolve()
    vault_path = Path(args.vault).resolve()

    if not source_dir.exists():
        console.print(f"❌ [red]Source not found:[/red] {source_dir}")
        return 1

    if not vault_path.exists():
        console.print(f"❌ [red]Vault not found:[/red] {vault_path}")
        return 1

    # Check for main.js
    main_js = source_dir / "main.js"
    if not main_js.exists():
        console.print(f"❌ [red]main.js not found in {source_dir}[/red]")
        console.print("Run: [cyan]npm run build[/cyan]")
        return 1

    # Create event handler
    event_handler = PluginSyncHandler(source_dir, vault_path, args.plugin_id)

    # Setup observer
    observer = Observer()
    observer.schedule(event_handler, str(source_dir), recursive=True)

    try:
        observer.start()
        console.print("👀 [green]Monitoring active[/green] (Ctrl+C to stop)")
        console.print()

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        console.print()
        console.print("🛑 [yellow]Stopping...[/yellow]")
        observer.stop()

    observer.join()
    console.print("✅ [green]Sync stopped[/green]")
    return 0


if __name__ == "__main__":
    exit(main())
