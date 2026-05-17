# CalDavSync

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
- CalDAV collection URL and username settings;
- encrypted local CalDAV password storage using WebCrypto AES-GCM;
- `PROPFIND` validation;
- dry-run planning;
- create, update, and delete mirroring;
- a 30% default bulk-delete guard;
- local logs;
- manual ICS backup download;
- automatic periodic sync via Thunderbird alarms.

## Install for local testing

Because CalDavSync uses a Thunderbird Experiment API, the most reliable local
test path is Thunderbird's temporary add-on loader:

1. Open Thunderbird.
2. Go to Add-ons and Themes.
3. Open the gear menu and choose Debug Add-ons.
4. Choose Load Temporary Add-on.
5. Select this directory's `manifest.json`.

Temporary add-ons are removed when Thunderbird restarts.

## Install private XPI

1. Open Thunderbird.
2. Go to Add-ons and Themes.
3. Open the gear menu and choose Install Add-on From File.
4. Select the generated `CalDavSync-vX.Y.Z.xpi`.

If Thunderbird reports that the XPI is corrupt or cannot be verified, install it
through Debug Add-ons while developing, or submit/sign the XPI as an unlisted
Thunderbird add-on before permanent installation. Experiment APIs are privileged
and may not install permanently as unsigned packages.

## Configure

1. Open the extension options.
2. Select a local calendar. Non-local calendars are disabled.
3. Enter the CalDAV collection URL, for example:
   `https://example.com/dav/calendars/user/local-mirror/`
4. Enter credentials. Leave the password blank later to keep the saved password.
5. Click Validate CalDAV.
6. Click Download ICS backup.
7. Click Dry run and review the planned operations.
8. Click Sync now.

Use a dedicated, preferably empty CalDAV collection for the first test.
If no local calendars appear, click Diagnostics and copy the Status output.

## Behavior

- A local create writes `<UID>.ics` to the CalDAV collection.
- A local update overwrites the matching remote event.
- A local delete deletes only events previously created by this extension.
- Remote changes are ignored; the next local change overwrites the remote copy.
- Events contain `X-LOCAL-CALDAV-MIRROR-MANAGED:TRUE` so the extension can
  identify its own remote objects.

## Important limitations

- The CalDAV password is encrypted in extension local storage with a local
  automatic key. This avoids plain text storage, but anyone with full access to
  the Thunderbird profile may also recover the key.
- The extension relies on Thunderbird Experiment APIs, which have full
  Thunderbird privileges and can change across major Thunderbird versions.
- The CalDAV server must not send scheduling mail merely because a passive
  `VEVENT` with `ATTENDEE` properties is uploaded.
- Use Download ICS backup before the first destructive test. Thunderbird's
  built-in calendar export remains the safest independent backup.

## Package

Create a private XPI package:

```powershell
.\scripts\package.ps1
```

The script validates JSON and JavaScript syntax, then creates
`CalDavSync-vX.Y.Z.xpi` with ZIP entries using `/` path separators.
