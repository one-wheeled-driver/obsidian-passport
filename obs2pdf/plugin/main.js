"use strict";

const obsidian = require("obsidian");
const child_process = require("child_process");
const path = require("path");

const DEFAULT_SETTINGS = {
  pythonPath: "python3",
  strictMode: false,
  openPdfAfterExport: true,
};

class Obs2PdfPlugin extends obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.addCommand({
      id: "export-pdf-citations",
      name: "Export to PDF with citations",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          this.runExport(file.path);
        }
        return true;
      },
    });

    this.addSettingTab(new Obs2PdfSettingTab(this.app, this));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  runExport(activeFilePath) {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof obsidian.FileSystemAdapter)) {
      new obsidian.Notice("obs2pdf: Could not determine vault path.");
      return;
    }
    const vaultBase = adapter.getBasePath();
    const pluginDir = path.join(vaultBase, this.manifest.dir);
    const scriptPath = path.join(pluginDir, "obs2pdf.py");
    const absoluteFile = path.join(vaultBase, activeFilePath);

    const args = [scriptPath, absoluteFile, vaultBase];
    if (this.settings.strictMode) {
      args.push("--strict");
    }

    new obsidian.Notice("obs2pdf: Exporting\u2026");

    child_process.execFile(
      this.settings.pythonPath,
      args,
      { timeout: 60000 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr && stderr.trim()) || error.message;
          new obsidian.Notice("obs2pdf: Export failed.\n" + msg, 10000);
          console.error("obs2pdf error:", error, stderr);
          return;
        }

        new obsidian.Notice("obs2pdf: Export complete.\n" + stdout.trim(), 8000);

        if (this.settings.openPdfAfterExport) {
          this.openPdf(absoluteFile);
        }
      }
    );
  }

  openPdf(absoluteFile) {
    const parsed = path.parse(absoluteFile);
    const pdfPath = path.join(parsed.dir, parsed.name, parsed.name + "_pandoc.pdf");
    try {
      const { shell } = require("electron");
      shell.openPath(pdfPath);
    } catch (_) {
      // electron shell unavailable
    }
  }
}

class Obs2PdfSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new obsidian.Setting(containerEl)
      .setName("Python path")
      .setDesc("Path to the Python interpreter (e.g. python3, /usr/bin/python3)")
      .addText((text) =>
        text
          .setPlaceholder("python3")
          .setValue(this.plugin.settings.pythonPath)
          .onChange(async (value) => {
            this.plugin.settings.pythonPath = value;
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName("Strict mode")
      .setDesc("Abort export if any linked note is missing or lacks a cite-key")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.strictMode)
          .onChange(async (value) => {
            this.plugin.settings.strictMode = value;
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName("Open PDF after export")
      .setDesc("Automatically open the generated PDF in the system viewer")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.openPdfAfterExport)
          .onChange(async (value) => {
            this.plugin.settings.openPdfAfterExport = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = Obs2PdfPlugin;
