const fs = require("node:fs");
const path = require("node:path");

const PROCESSING_MODES = Object.freeze({
  NORMAL: "normal",
  AUTO: "auto",
});

// The shortcut pack is an Explorer-first product. A newly installed or
// upgraded copy therefore starts in Auto Mode, while users can still choose
// Normal Mode from the desktop catalog whenever they need editing controls.
const SHORTCUT_ENGINE_MODE_VERSION = 2;

function normalizeProcessingMode(value) {
  return value === PROCESSING_MODES.NORMAL ? PROCESSING_MODES.NORMAL : PROCESSING_MODES.AUTO;
}

class DesktopSettings {
  constructor({ userDataPath }) {
    this.settingsPath = path.join(userDataPath, "desktop-settings.json");
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  getProcessingMode() {
    const settings = this.read();
    if (settings.shortcutEngineModeVersion !== SHORTCUT_ENGINE_MODE_VERSION) {
      return PROCESSING_MODES.AUTO;
    }
    return normalizeProcessingMode(settings.processingMode);
  }

  update(changes) {
    const next = { ...this.read(), ...changes };
    const temporaryPath = this.settingsPath + ".new";
    fs.writeFileSync(temporaryPath, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.settingsPath);
    return next;
  }

  setProcessingMode(mode) {
    return this.update({ shortcutEngineModeVersion: SHORTCUT_ENGINE_MODE_VERSION,
      processingMode: normalizeProcessingMode(mode) }).processingMode;
  }

  toggleProcessingMode() {
    return this.setProcessingMode(
      this.getProcessingMode() === PROCESSING_MODES.AUTO ? PROCESSING_MODES.NORMAL : PROCESSING_MODES.AUTO,
    );
  }
}

module.exports = {
  DesktopSettings,
  PROCESSING_MODES,
  SHORTCUT_ENGINE_MODE_VERSION,
  normalizeProcessingMode,
};
