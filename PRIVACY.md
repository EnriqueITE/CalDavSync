# CalDavSync Privacy Policy

CalDavSync stores its configuration locally in Thunderbird extension storage.
The CalDAV password is stored locally in Thunderbird's native Password Manager.

The add-on sends calendar event data and CalDAV authentication information only
to the CalDAV collection URL that the user configures in the options page. It
does not send calendar data, account data, credentials, telemetry, or analytics
to the author or to any third-party service controlled by the author.

The options page includes an external support link. Opening that link is a
manual user action and is outside the sync workflow.

## Permissions and Data Flow

| Permission or access | Data involved | Destination |
| --- | --- | --- |
| Thunderbird Experiment API | Selected local calendar metadata and events | Local extension process; exported only during backup or sync |
| Thunderbird Password Manager | CalDAV password | Local Thunderbird profile; sent only to the configured CalDAV server for authentication |
| Extension storage | Settings, sync state, logs, and first-run acknowledgement | Local Thunderbird profile |
| Network access to user-configured CalDAV URL | Calendar event data and CalDAV credentials | The HTTPS CalDAV collection URL entered by the user |
| Manual support link | Browser navigation chosen by the user | The external support site opened by the user |

CalDavSync does not collect analytics, run ads, load remote code, or send
calendar data, account data, credentials, telemetry, or diagnostics to the
author.
