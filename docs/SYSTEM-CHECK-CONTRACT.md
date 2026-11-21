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
   title, meaning, action, evidence: [string], when: ISO|null,
   scanState: "complete"|"partial"|"failed"|"unsupported" }]
```

`scanState` describes collection coverage independently of finding severity.
Available real faults keep their original severity when collection is partial;
an incomplete area cannot emit an area-wide `ok` finding. Its collection note is
informational, while the overall summary reflects the incomplete coverage.
When every supplied payload is unsupported, the existing single
`system-unsupported` finding carries `scanAreas`, naming the supplied areas. This
does not mark omitted areas as checked.

## Coverage and overall verdict

`systemScanCoverage({ drivers, events, logs }, { states, areas })` records each
required area separately. By default all three areas are required. `states` uses
the current attempt state (`idle`, `loading`, `done`, `error`); `areas` is an
explicit subset only for a consumer such as setup's driver-only quick scan.

| Coverage state | Meaning |
| --- | --- |
| `complete` | Supported response with its required collection arrays and an empty errors array |
| `partial` | Supported response reports collection errors or lacks a required collection/errors array |
| `failed` | Command rejected, or an object response lacks a literal supported declaration |
| `unsupported` | Response explicitly declares `supported:false` |
| `pending` | Replacement/current command is still loading |
| `unscanned` | Required area has no current attempt/result |

The bridge returns unsupported fallback data only when no native command
function exists. A present command returning null, an array or another non-object
rejects with a fixed invalid-response message and can be retried. These checks
validate the top-level contract; they do not validate arbitrary hostile nested
objects or certify that the native collector reports every OS-level omission.

Coverage includes all required area labels/states/details, per-state counts,
completed/total counts, a complete boolean and a human-readable summary.
`summarizeFindings(findings, coverage)` preserves real error/warning priority,
keeps an entirely unsupported environment informational and requires complete
coverage before returning `pass`. With no explicit coverage, it reconstructs
coverage from interpreter-produced `scanState` metadata. Raw `ok`/`info` counts
alone cannot establish an all-clear.

The System Health view and both HTML/PDF reports retain the same coverage and
name failed, unsupported and incomplete areas even when no fault finding exists
for them. Exports are available after failed attempts but blocked while a scan
is pending and for an entirely unsupported environment. Retry replaces only its
area; duplicate pending requests coalesce. Disposed results cannot repaint or
start exports. PDF preparation/feedback uses the captured result revision; this
does not cancel an export already submitted to the existing report adapter.

Diagnostics context retains this coverage alongside its reduced findings. The
setup quick scan explicitly requires only drivers; newly saved setup answers
retain a boolean completion value, and their summary labels incomplete driver
scans. Starting another quick scan clears the old health answer. Legacy answers
without completion metadata keep their original count-only representation.

Native command names, argument shapes, collection limits, fault heuristics and
Pre-gig measurement grading remain unchanged. Coverage denotes completion of the
requested bounded scan contract, not a guarantee about the entire computer.
