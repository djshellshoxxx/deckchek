# System Health scan — data contract

Windows-only. Rust (`src-tauri/src/system_check.rs`) collects raw data; JavaScript (`app/system-check.js`) interprets it into user-facing findings. On non-Windows every command returns `{ supported: false, errors: ["System Health scans require Windows."] }` with empty arrays.

All payloads are camelCase JSON.

## `system_scan_drivers()` -> DriverScan
```
{ supported: bool, scannedAt: ISO string,
  drivers: [{ deviceName, deviceClass,            // MEDIA | AudioEndpoint | USB | HIDClass | ... (audio-relevant only)
              manufacturer, driverProvider, driverVersion, driverDate,   // strings or null
              infName, hardwareId,                // strings or null
              isSigned: bool|null, signer: string|null,
              status: "OK"|"Error"|"Degraded"|"Unknown",
              problemCode: number|null,           // Win32_PnPEntity.ConfigManagerErrorCode (0 = OK)
              present: bool }],
  asioDrivers: [{ name, clsid, dllPath: string|null, dllExists: bool,
                  signatureStatus: "Valid"|"NotSigned"|"HashMismatch"|"UnknownError"|...|null, signer: string|null }],
  errors: [string] }
```
Audio-relevant = device class MEDIA, AudioEndpoint, or USB/HID devices whose name or manufacturer matches known DJ/audio vendors (Pioneer, AlphaTheta, Denon, inMusic, Native Instruments, Serato, Rane, Numark, Reloop, Hercules, Allen & Heath, Focusrite, RME, Behringer, Roland, Steinberg, Yamaha, Audient, MOTU, PreSonus, Universal Audio, Ecler, Mixars, Technics, Audio-Technica, Rekordbox).

## `system_scan_events({ days })` -> EventScan   (days clamped 1..=90, default 14)
```
{ supported, scannedAt, days,
  events: [{ log: "System"|"Application", provider, eventId: number,
             level: "Critical"|"Error"|"Warning",
             timeCreated: ISO string, message: string (<= 2000 chars),
             category: "audio"|"usb"|"driver"|"djApp"|"other",
             appName: string|null,          // Application Error/Hang/WER: faulting application exe
             faultingModule: string|null,   // e.g. "asio_xyz.dll", "ntdll.dll"
             exceptionCode: string|null }], // e.g. "0xc0000005"
  errors }
```
System log: providers covering Audio service (Microsoft-Windows-Audio, AudioSrv), PnP/driver install (Microsoft-Windows-Kernel-PnP, Microsoft-Windows-UserPnp, Service Control Manager entries naming audio services), USB (USBHUB3, USBXHCI, usbaudio/usbaudio2), and kernel-mode audio (portcls). Application log: Application Error (1000), Application Hang (1002), Windows Error Reporting (1001) where the application or message matches a known DJ program (see below). Max 300 events, newest first.

## `system_scan_dj_logs()` -> DjLogScan
```
{ supported, scannedAt,
  apps: [{ app: "Serato DJ Pro"|"Serato DJ Lite"|"Traktor Pro"|"rekordbox"|"VirtualDJ"|"Mixxx"|"djay Pro"|"Engine DJ"|...,
           exeNames: [string], installed: bool,
           locations: [{ path, exists: bool }],
           files: [{ path, kind: "log"|"crashDump"|"crashReport",
                     modified: ISO string, sizeBytes: number,
                     matches: [{ lineNo, line (<= 400 chars), severity: "crash"|"error"|"warning" }],  // max 50
                     tail: [string] }] }],                 // last 20 lines, logs only
  errors }
```
Crash evidence sources: `%LOCALAPPDATA%\CrashDumps\<exe>*.dmp`, `%PROGRAMDATA%\Microsoft\Windows\WER\ReportArchive|ReportQueue\AppCrash_<exe>*`/`AppHang_<exe>*`, plus vendor crash folders. Only files modified in the last 90 days, newest 10 per app; logs read from the last 2 MB only.

## Findings (JS `interpretSystemScan({ drivers, events, logs })`)
```
[{ id, area: "drivers"|"events"|"djLogs", severity: "ok"|"info"|"warning"|"error",
   title, meaning, action, evidence: [string], when: ISO|null }]
```
