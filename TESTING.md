# Manual Test Plan

Use a dedicated local Thunderbird calendar and a dedicated CalDAV collection.

## Smoke test

1. Load the extension temporarily.
2. Open options.
3. Confirm the first-run notice explains the Thunderbird full-access warning.
4. Confirm the Permissions section explains Experiment API, network access,
   local storage, and what the add-on does not read.
5. Confirm the local calendar appears and remote calendars are disabled.
6. Save settings with a password.
7. Validate CalDAV.
8. Run Dry run.
9. Run Sync now.
10. Verify events appear in another CalDAV client.
11. Reopen options and confirm the password field is blank while the saved
   password indicator is shown.
12. Confirm Diagnostics is available only under Advanced troubleshooting.
13. Confirm the top section buttons switch between Connection, Schedule, Sync
    Actions, Activity Log, and Permissions without leaving the page half
    scrolled.
14. With no connection configured, confirm Test connection, Download backup,
    Dry run, Sync now, Force sync, and popup Sync Now show a short actionable
    message instead of a stack trace or "unexpected error".
15. Confirm Last result text can be selected and copied with the Copy button.
16. Try invalid values and confirm they are rejected before saving or syncing:
    non-HTTPS CalDAV URL, URL with credentials/query/fragment, sync interval
    below 1, delete guard outside 1-100, and negative sync windows.
17. Confirm remote/non-local calendars cannot remain selected after refreshing
    the calendar list.

## Event scenarios

- Create one timed event locally and sync.
- Edit title, location, description, and dates locally and sync.
- Delete the event locally and sync.
- Create an all-day event and sync.
- Create a recurring event and sync.
- Create a recurring event with one changed occurrence and sync.
- Create an event with `ATTENDEE` entries and sync.

## Safety scenarios

- Change a mirrored event directly on the CalDAV server, then modify it locally
  and confirm the local copy overwrites the remote copy.
- Delete more than the configured delete guard percent locally and confirm sync
  blocks until "force deletes" is used.
- Disconnect the network or stop the CalDAV server and confirm the error is
  logged without clearing mirror state.
- Clear saved credentials and confirm validate/sync fails with a clear error.

## Invitation safety

Check the uploaded ICS on the CalDAV server:

- It must not include top-level `METHOD:REQUEST` or `METHOD:REPLY`.
- It may include `ATTENDEE` and `ORGANIZER` copied from Thunderbird.
- It should include `X-LOCAL-CALDAV-MIRROR-MANAGED:TRUE`.

## Storage safety

- Inspect extension storage and confirm `settings` does not contain `password`.
- Confirm the password is stored through Thunderbird's Password Manager, not in
  extension `storage.local`.
- Confirm logs do not contain the CalDAV password.
