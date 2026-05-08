import { Plugin } from "obsidian";
import type { TFile } from "obsidian";
import { join, normalize } from "node:path";
import { writeFile } from "node:fs/promises";

import { DEFAULT_SETTINGS, type VaultPassportSettings } from "./settings.js";
import { VaultPassportSettingTab } from "./settings-tab.js";
import { exportPdf } from "./commands/export-pdf.js";

// Embedded by esbuild's text loader (see esbuild.config.mjs).
import NUMBERED_TITLE_CSL from "./assets/numbered-title.csl";

export default class VaultPassportPlugin extends Plugin {
  // Initialized in onload(); declare definitely-assigned to satisfy TS strict.
  settings!: VaultPassportSettings;

  override async onload(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<VaultPassportSettings> | null
    );

    await this.ensureEmbeddedCsl();

    this.addCommand({
      id: "vault-passport-export",
      name: "Export document (Vault Passport)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          void exportPdf(this.app, file as TFile, this.manifest.dir ?? "", this.settings);
        }
        return true;
      },
    });

    this.addSettingTab(new VaultPassportSettingTab(this.app, this));
  }

  override async onunload(): Promise<void> {
    // No cleanup required: no listeners or external state to tear down.
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Write the embedded CSL file to the plugin folder if it isn't already
   * there. Required because the Obsidian community plugin browser only
   * delivers main.js + manifest.json — anything else (like our CSL file)
   * has to be materialised at runtime.
   */
  private async ensureEmbeddedCsl(): Promise<void> {
    const pluginDir = this.manifest.dir;
    if (!pluginDir) return;
    const adapter = this.app.vault.adapter;
    if (!("getBasePath" in adapter)) return;

    const cslVaultPath = `${normalize(pluginDir)}/numbered-title.csl`;
    const exists = await adapter.exists(cslVaultPath);
    if (exists) return;

    const fsAdapter = adapter as unknown as { getBasePath(): string };
    const cslAbsPath = join(fsAdapter.getBasePath(), cslVaultPath);
    try {
      await writeFile(cslAbsPath, NUMBERED_TITLE_CSL, "utf8");
    } catch (err) {
      console.warn("Vault Passport: failed to write embedded CSL", err);
    }
  }
}
