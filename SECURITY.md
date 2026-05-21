# Security Policy

## Supported Versions

Security reports should target the latest released version of CalDavSync in this
repository. Older XPI builds are not supported once a newer release is
published.

## Reporting a Vulnerability

Please report security issues privately to the maintainer before opening a
public issue. Include:

- A clear description of the issue.
- Steps to reproduce.
- The Thunderbird version, CalDavSync version, and operating system.
- Whether calendar data, credentials, or local Thunderbird profile data may be
  exposed or modified.

The maintainer is Enrique Serrano Aparicio.

## Security Model

CalDavSync is a Thunderbird extension that mirrors one selected local calendar
to one user-configured HTTPS CalDAV collection. It intentionally does not load
remote code, use telemetry, use analytics, or send data to maintainer-operated
services.

The add-on uses a Thunderbird Experiment API. Thunderbird shows a full-access
permission warning for this class of add-on because Experiment APIs run with
privileged Thunderbird access. CalDavSync uses that privileged access for:

- Reading the selected local calendar.
- Exporting local calendar events.
- Storing and retrieving the CalDAV password through Thunderbird's native
  Password Manager.

The CalDAV endpoint is user supplied. CalDavSync validates that collection URLs
use HTTPS and rejects embedded credentials, query strings, and fragments.

## Out of Scope

- Issues caused by a compromised Thunderbird profile or operating system.
- Recovery of passwords already saved in Thunderbird's Password Manager by a
  user or process with full profile access.
- CalDAV server behavior outside this add-on, including server-side invitation
  mail triggered by uploaded passive VEVENT data.
