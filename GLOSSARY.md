# WWE Champions

A dashboard of who currently holds each WWE championship, published as a weekly snapshot built from WWE.com and Cagematch.

## Language

**Snapshot**:
The published set of champion records plus the time the refresh that produced them completed.
_Avoid_: cache, data file

**Champion record**:
One championship and, unless the title is vacant, its current holder and that reign's facts (start date, reign length, defense status, sources).
_Avoid_: entry, row

**Refresh**:
One run that reads WWE.com and Cagematch and produces either a new snapshot or a refusal.
_Avoid_: scrape (for the whole run), sync, update

**Refusal**:
The outcome of a refresh whose upstream results are incomplete, or whose sources disagree about who holds a title; the current snapshot stays exactly as it was.
_Avoid_: failure, error

**Title change**:
A championship passing to a new holder. WWE.com usually shows it days before Cagematch does.
_Avoid_: switch, new reign (for the event)

**Vacant title**:
A championship with no current holder. It keeps its place on the dashboard and shows as vacant until a new champion is crowned.
_Avoid_: inactive, empty title

**Reign length**:
Whole days from the reign's start date to the refresh's UTC date. Stored in the champion record as `daysAsChampion`; the field keeps that name so the snapshot format does not change.
_Avoid_: days held, days as champion

**Defense status**:
What a champion record says about the holder's title defenses in the current reign: **known** (the reign has a last defense date), **confirmed none** (a source confirms no defenses yet), or **unavailable** (the defense history could not be read or matched). Unknown or missing history is unavailable, never confirmed none. Stored as `defenseStatus` (`known`, `none`, `unavailable`); snapshots written before the field existed have no value and are treated as unavailable unless they carry a usable defense date.
_Avoid_: no defenses (for a missing history), defense count
