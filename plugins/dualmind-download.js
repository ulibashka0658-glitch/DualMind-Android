const { withMainApplication, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function withDualMindDownload(config) {
  config = withMainApplication(config, config => {
    const result = config.modResults;
    if (result.language !== "kt") throw new Error("DualMind downloader requires Kotlin MainApplication");
    const registration = "add(com.danemadsen.maid.download.ModelDownloadPackage())";
    if (!result.contents.includes(registration)) {
      const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!anchor.test(result.contents)) throw new Error("Cannot locate React Native package registration");
      result.contents = result.contents.replace(anchor, match => match + "\n              " + registration);
    }
    return config;
  });
  return withDangerousMod(config, ["android", async config => {
    const source = path.join(config.modRequest.projectRoot, "native", "dualmind-download");
    const destination = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "java", "com", "danemadsen", "maid", "download");
    fs.mkdirSync(destination, { recursive: true });
    for (const filename of ["ModelDownloadStore.kt", "ModelDownloadModule.kt"]) {
      fs.copyFileSync(path.join(source, filename), path.join(destination, filename));
    }
    return config;
  }]);
};
