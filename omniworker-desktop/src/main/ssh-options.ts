export function buildSshControlOptions(platform = process.platform): string[] {
  if (platform === "win32") {
    return [
      "-o",
      "ControlMaster=no",
      "-o",
      "ControlPath=none",
      "-o",
      "ControlPersist=no",
    ];
  }

  return [
    "-o",
    "ControlMaster=auto",
    "-o",
    "ControlPath=~/.ssh/cm-omniworker-%r@%h:%p",
    "-o",
    "ControlPersist=60s",
  ];
}
