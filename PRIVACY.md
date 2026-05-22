# CalDavSync Privacy Notice

## Summary
- CalDavSync mirrors one selected local Thunderbird calendar to the private
  CalDAV collection URL you configure. Calendar data is sent only when you test
  the connection, run a dry run, sync, or export a backup.
- No account data, telemetry, analytics, ads, tracking, diagnostics, or calendar
  data are collected by the author or sent to author-operated services.
- Your CalDAV password is stored locally in Thunderbird's native Password
  Manager. It is not stored in `browser.storage.local`.

## Data CalDavSync Processes
- **Input:** Selected local Thunderbird calendar metadata and event data needed
  to build backup exports, dry-run plans, and CalDAV sync operations.
- **Credentials:** CalDAV username and password are used to authenticate with
  the configured CalDAV collection. The password is stored in Thunderbird's
  Password Manager and is sent only to that configured CalDAV endpoint.
- **Storage:** Calendar selection, CalDAV collection URL, username, sync
  schedule, delete guard settings, sync state, logs, and first-run
  acknowledgement are stored locally using Thunderbird extension storage.
- **Logs:** Local logs may include sync counts, operation summaries, and
  sanitized error details. Passwords are redacted, and configured URLs are
  stored without embedded credentials.
- **Backups:** Download backup exports are generated locally from the selected
  Thunderbird calendar and saved only when you choose to download them.

## Third Parties
- CalDavSync contacts only the HTTPS CalDAV collection URL entered by the user.
  The CalDAV provider receives calendar event data and authentication
  information needed for validation and sync.
- CalDavSync does not contact analytics, telemetry, advertising, tracking, or
  maintainer-operated backend services.
- The options page contains a manual support link. Opening that link is a user
  action and is outside the sync workflow.

## Permissions Justification
- `alarms`: Runs scheduled sync when automatic sync is enabled.
- `notifications`: Shows sync failure notifications.
- `storage`: Saves local settings, sync state, logs, and first-run
  acknowledgement. The CalDAV password is not stored here.
- `<all_urls>`: Allows requests to the user-configured HTTPS CalDAV collection.
  The destination cannot be fixed in advance because each user supplies their
  own CalDAV server URL. Runtime validation rejects non-HTTPS URLs and embedded
  credentials.
- `experiment_apis`: Required to access Thunderbird local calendars and
  Thunderbird's native Password Manager. Thunderbird displays a broad
  full-access warning for add-ons using Experiment APIs.

## Contact
- Email: hello@enriqueite.com
- You can disable or remove CalDavSync anytime from Thunderbird Add-ons Manager.
