# Permissions

CalDavSync is designed to mirror one local Thunderbird calendar to one
user-configured HTTPS CalDAV collection. This document explains the permissions
declared in `manifest.json` and how they are used.

## Thunderbird Full-Access Warning

Thunderbird shows a broad "full access" warning because CalDavSync uses a
Thunderbird Experiment API. The warning is attached to the privileged API model,
not to a request to read every part of Thunderbird.

CalDavSync uses the Experiment API to:

- List Thunderbird calendars.
- Read events from the selected local calendar.
- Export local calendar data for backup and sync.
- Store and retrieve the CalDAV password in Thunderbird's native Password
  Manager.

CalDavSync does not use this access to read mail, contacts, local files,
telemetry, analytics, or unrelated Thunderbird data.

## Manifest Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Stores settings, sync state, logs, and the first-run acknowledgement. The CalDAV password is not stored here. |
| `alarms` | Runs automatic sync on the configured interval. |
| `notifications` | Reserved for user-visible sync status and error notifications. |
| `<all_urls>` | Allows CalDAV requests to the HTTPS collection URL entered by the user. The destination is not known before install because each user supplies their own server URL. |
| `experiment_apis` | Provides privileged Thunderbird calendar and Password Manager access that standard WebExtension APIs do not expose. |

## Network and Data Flow

Calendar data and CalDAV authentication are sent only to the CalDAV collection
URL configured in the options page during connection testing and sync. The add-on
does not contact maintainer-operated services during sync.

The options page contains a manual support link. Opening that link is a user
action and is separate from calendar synchronization.

## Why `<all_urls>` Is Still Declared

The extension accepts arbitrary user-owned CalDAV servers. A static host
permission such as `https://example.com/*` would break most installations. An
optional host-permission flow was considered, but the Thunderbird full-access
Experiment warning would still remain, and adding another permission prompt
would make setup more fragile for a security benefit that is already enforced by
runtime URL validation.

The runtime CalDAV client accepts only HTTPS collection URLs and rejects embedded
credentials, query strings, and fragments.
