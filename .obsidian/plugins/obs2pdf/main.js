"use strict";

const obsidian = require("obsidian");
const child_process = require("child_process");
const path = require("path");

const DEFAULT_SETTINGS = {
  pythonPath: "python3",
  strictMode: false,
  openPdfAfterExport: true,
  toc: false,
  templateName: "",
  vaultTemplateDir: "templates",
  extraVars: "",
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
    if (this.settings.toc) {
      args.push("--toc");
    }
    if (this.settings.templateName) {
      args.push("--template", this.settings.templateName);
    }
    if (this.settings.vaultTemplateDir) {
      args.push("--vault-template-dir", this.settings.vaultTemplateDir);
    }
    if (this.settings.extraVars) {
      const lines = this.settings.extraVars
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && l.includes("="));
      for (const line of lines) {
        args.push("--var", line);
      }
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
    const pdfPath = path.join(parsed.dir, parsed.name + ".pdf");
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

    new obsidian.Setting(containerEl)
      .setName("Table of contents")
      .setDesc("Include a table of contents in the exported PDF")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.toc)
          .onChange(async (value) => {
            this.plugin.settings.toc = value;
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName("Template name")
      .setDesc(
        "Template to use for PDF export. " +
        "Looked up in order: vault template folder → plugin templates/ → " +
        "pandoc system install (e.g. 'eisvogel' if installed globally)."
      )
      .addText((text) =>
        text
          .setPlaceholder("e.g. eisvogel or custom.latex")
          .setValue(this.plugin.settings.templateName)
          .onChange(async (value) => {
            this.plugin.settings.templateName = value;
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName("Vault template folder")
      .setDesc(
        "Folder relative to vault root containing shared templates. " +
        "Place templates here so everyone working on the vault uses the same one."
      )
      .addText((text) =>
        text
          .setPlaceholder("templates")
          .setValue(this.plugin.settings.vaultTemplateDir)
          .onChange(async (value) => {
            this.plugin.settings.vaultTemplateDir = value;
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName("Extra pandoc variables")
      .setDesc(
        "Template variables passed to pandoc as -V flags. " +
        "One per line in key=value format. " +
        "Document frontmatter overrides these defaults."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("colorlinks=true\ngeometry=margin=2cm")
          .setValue(this.plugin.settings.extraVars)
          .onChange(async (value) => {
            this.plugin.settings.extraVars = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = Obs2PdfPlugin;
