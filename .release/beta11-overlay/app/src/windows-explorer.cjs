const { spawn } = require("node:child_process");
const fs = require("node:fs");

// One STA PowerShell worker keeps Shell.Application alive. First requests wait
// for READY instead of killing Add-Type after 650–900 ms on a slower PC.
const selectionScript = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PdfRootForegroundWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder text, int count);
}
'@
$shell = New-Object -ComObject Shell.Application
function SelectedPaths($window) {
  try { @($window.Document.SelectedItems() | ForEach-Object { $_.Path } | Where-Object { $_ }) } catch { @() }
}
function ReadSelection($anchor) {
  $foreground = [PdfRootForegroundWindow]::GetForegroundWindow()
  $root = [PdfRootForegroundWindow]::GetAncestor($foreground, 2)
  $handles = @($foreground.ToInt64(), $root.ToInt64())
  $windows = @($shell.Windows())
  $window = $windows | Where-Object { $handles -contains $_.HWND } | Select-Object -First 1
  $class = New-Object System.Text.StringBuilder 256
  [void][PdfRootForegroundWindow]::GetClassName($root, $class, 256)
  # Desktop shell discovery is optional. When COM cannot expose it, an
  # explicit right-click path or the normal file chooser remains available.
  $desktop = $null
  try {
    $desktopHandle = 0
    $desktop = $shell.Windows().FindWindowSW(0, 0, 8, [ref]$desktopHandle, 1)
  } catch {}
  if ($null -eq $window -and @('Progman','WorkerW') -contains $class.ToString()) { $window = $desktop }
  if ($anchor) {
    $matches = @(@($windows) + @($desktop) | Where-Object {
      $null -ne $_ -and @(SelectedPaths $_) -contains $anchor
    })
    if ($matches.Count -eq 1) { $window = $matches[0] }
    elseif (@(SelectedPaths $window) -notcontains $anchor) { return @($anchor) }
  } elseif ($null -eq $window) {
    $pidValue = [uint32]0
    [void][PdfRootForegroundWindow]::GetWindowThreadProcessId($foreground, [ref]$pidValue)
    $processName = (Get-Process -Id $pidValue -ErrorAction SilentlyContinue).ProcessName
    if ($processName -eq 'PDFRoot Desktop Pro') {
      $selected = @($windows | Where-Object { @(SelectedPaths $_).Count -gt 0 })
      if ($selected.Count -eq 1) { $window = $selected[0] }
    }
  }
  @(SelectedPaths $window)
}
[Console]::Out.WriteLine('READY')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $request = $null
  try {
    $request = $line | ConvertFrom-Json
    $paths = @(ReadSelection $request.anchor)
    [Console]::Out.WriteLine((@{ id = [int]$request.id; paths = $paths } | ConvertTo-Json -Compress -Depth 3))
  } catch {
    if ($null -ne $request) { [Console]::Out.WriteLine('{"id":' + $request.id + ',"paths":[]}') }
  }
}
`;

function parseExplorerPaths(rawOutput, exists = fs.existsSync) {
  if (typeof rawOutput !== "string" || !rawOutput.trim()) return [];
  try {
    const parsed = JSON.parse(rawOutput.trim());
    return (Array.isArray(parsed) ? parsed : [parsed])
      .filter((file) => typeof file === "string" && exists(file));
  } catch { return []; }
}

function createSelectionService({ platform = process.platform, spawnImpl = spawn, exists = fs.existsSync,
  startupMs = 5000, requestMs = 1200, restartMs = 3000 } = {}) {
  let worker, ready = false, buffer = "", readyPromise, readyResolve, startupTimer, restartTimer;
  let stopped = false, failures = 0, requestId = 0;
  const pending = new Map();
  function clear(child) {
    if (worker !== child) return;
    clearTimeout(startupTimer); worker = undefined; ready = false; buffer = "";
    readyResolve?.(false); readyResolve = undefined;
    for (const item of pending.values()) { clearTimeout(item.timer); item.resolve([]); }
    pending.clear();
    if (!stopped) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(start, Math.min(30_000, restartMs * 2 ** Math.min(failures++, 3)));
      restartTimer.unref?.();
    }
  }
  function line(value) {
    if (value === "READY") {
      clearTimeout(startupTimer); ready = true; failures = 0; readyResolve?.(true); readyResolve = undefined;
      return;
    }
    let data;
    try { data = JSON.parse(value); } catch { return; }
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id); clearTimeout(item.timer);
    item.resolve(Array.isArray(data.paths) ? data.paths.filter(file => typeof file === "string" && exists(file)) : []);
  }
  function start() {
    if (platform !== "win32" || stopped) return Promise.resolve(false);
    if (worker) return readyPromise;
    clearTimeout(restartTimer);
    readyPromise = new Promise(resolve => { readyResolve = resolve; });
    let child;
    try {
      child = spawnImpl("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA",
        "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(selectionScript, "utf16le").toString("base64")],
        { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    } catch { readyResolve(false); readyResolve = undefined; return readyPromise; }
    worker = child;
    startupTimer = setTimeout(() => { clear(child); try { child.kill(); } catch {} }, startupMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      if (worker !== child) return;
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const value = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1); line(value);
      }
    });
    child.stdin.on("error", () => { clear(child); try { child.kill(); } catch {} });
    child.once("error", () => clear(child)); child.once("close", () => clear(child));
    return readyPromise;
  }
  function stop() {
    stopped = true; clearTimeout(restartTimer); clearTimeout(startupTimer);
    const child = worker;
    if (child) { clear(child); try { child.stdin.end(); child.kill(); } catch {} }
  }
  async function get({ anchor, timeoutMs = requestMs } = {}) {
    if (platform !== "win32" || stopped || !await start() || !ready || !worker?.stdin?.writable) return [];
    const child = worker;
    const id = ++requestId;
    return new Promise(resolve => {
      const timer = setTimeout(() => { clear(child); try { child.kill(); } catch {} }, Math.max(200, Math.min(5000, timeoutMs)));
      pending.set(id, { resolve, timer });
      try {
        child.stdin.write(JSON.stringify({ id, anchor: typeof anchor === "string" ? anchor : "" }) + "\n", error => {
          if (error) { clear(child); try { child.kill(); } catch {} }
        });
      } catch { clear(child); try { child.kill(); } catch {} }
    });
  }
  return { start, stop, get };
}
const service = createSelectionService();
module.exports = { createSelectionService, selectionScript, parseExplorerPaths,
  getFocusedExplorerSelection: service.get, startExplorerSelectionService: service.start, stopExplorerSelectionService: service.stop };
