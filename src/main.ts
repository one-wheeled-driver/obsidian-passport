import { Plugin } from "obsidian";

export default class VaultPassportPlugin extends Plugin {
  override async onload(): Promise<void> {
    console.warn("Vault Passport: stub onload — implementation pending");
  }

  override async onunload(): Promise<void> {
    // no-op
  }
}
