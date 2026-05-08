import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type VaultPassportPlugin from "./main.js";

export class VaultPassportSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: VaultPassportPlugin
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Strict mode")
      .setDesc("Abort export if any linked note is missing from the vault.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.strictMode)
          .onChange(async (value) => {
            this.plugin.settings.strictMode = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Open PDF after export")
      .setDesc("Automatically open the generated PDF in the system viewer.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.openPdfAfterExport)
          .onChange(async (value) => {
            this.plugin.settings.openPdfAfterExport = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Table of contents")
      .setDesc("Include a table of contents in the exported PDF.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.toc).onChange(async (value) => {
          this.plugin.settings.toc = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Convert callouts to boxes")
      .setDesc(
        "Convert Obsidian callouts (> [!NOTE] …) to styled awesomebox " +
          "environments in the PDF. Works out of the box with the eisvogel template."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.callouts).onChange(async (value) => {
          this.plugin.settings.callouts = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Template name")
      .setDesc(
        "Pandoc template. Searched in: vault template folder → plugin " +
          "templates/ → pandoc/extra built-in (e.g. 'eisvogel')."
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

    new Setting(containerEl)
      .setName("Vault template folder")
      .setDesc(
        "Folder relative to vault root containing shared templates (default: templates)."
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

    new Setting(containerEl)
      .setName("Extra pandoc variables")
      .setDesc(
        "Template variables passed to pandoc as -V flags. One per line in " +
          "key=value format. Document frontmatter overrides these defaults."
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
