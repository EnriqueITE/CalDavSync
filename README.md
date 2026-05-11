# Local Calendar CalDAV Mirror

Thunderbird extension that mirrors one local Thunderbird calendar to one CalDAV
collection. Thunderbird does not need to configure that CalDAV calendar.

The local Thunderbird calendar is authoritative. Remote edits are not imported.
The extension writes passive `VEVENT` copies and strips top-level iTIP `METHOD`
properties so it does not intentionally accept invitations, send replies, or
trigger invitation workflows.

## Current status

This is an initial implementation for manual testing on Thunderbird 128+.
It includes:

- local calendar selection;
- CalDAV collection URL, username, and password settings;
- `PROPFIND` validation;
- dry-run planning;
- create, update, and delete mirroring;
- a 30% default bulk-delete guard;
- local logs;
- manual ICS backup download;
- automatic periodic sync via Thunderbird alarms.

## Install for testing

1. Open Thunderbird.
2. Go to Add-ons and Themes.
3. Open the gear menu and choose Debug Add-ons.
4. Choose Load Temporary Add-on.
5. Select this directory's `manifest.json`.

Temporary add-ons are removed when Thunderbird restarts.

## Configure

1. Open the extension options.
2. Select a local calendar. Non-local calendars are disabled.
3. Enter the CalDAV collection URL, for example:
   `https://example.com/dav/calendars/user/local-mirror/`
4. Enter credentials.
5. Click Validate CalDAV.
6. Click Download ICS backup.
7. Click Dry run and review the planned operations.
8. Click Sync now.

Use a dedicated, preferably empty CalDAV collection for the first test.

## Behavior

- A local create writes `<UID>.ics` to the CalDAV collection.
- A local update overwrites the matching remote event.
- A local delete deletes only events previously created by this extension.
- Remote changes are ignored; the next local change overwrites the remote copy.
- Events contain `X-LOCAL-CALDAV-MIRROR-MANAGED:TRUE` so the extension can
  identify its own remote objects.

## Important limitations

- Passwords are stored in extension local storage in this first version.
  Before real daily use, move credentials to Thunderbird's login manager.
- The extension relies on Thunderbird Experiment APIs, which have full
  Thunderbird privileges and can change across major Thunderbird versions.
- The CalDAV server must not send scheduling mail merely because a passive
  `VEVENT` with `ATTENDEE` properties is uploaded.
- Use Download ICS backup before the first destructive test. Thunderbird's
  built-in calendar export remains the safest independent backup.

## Package

Create an `.xpi` by zipping the contents of this directory, not the directory
itself. PowerShell example:

```powershell
Compress-Archive -Path manifest.json,api,src,ui,README.md -DestinationPath local-caldav-mirror.xpi -Force
```
