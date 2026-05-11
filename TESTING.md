# Manual Test Plan

Use a dedicated local Thunderbird calendar and a dedicated CalDAV collection.

## Smoke test

1. Load the extension temporarily.
2. Open options.
3. Confirm the local calendar appears and remote calendars are disabled.
4. Save settings with a password.
5. Validate CalDAV.
6. Run Dry run.
7. Run Sync now.
8. Verify events appear in another CalDAV client.
9. Reopen options and confirm the password field is blank while the saved
   password indicator is shown.

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
- Confirm `secrets.password` contains only `iv`, `ciphertext`, and `updatedAt`.
- Confirm logs do not contain the CalDAV password.
