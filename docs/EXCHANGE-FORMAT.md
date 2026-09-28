# passalong exchange format

The exchange format is the documented, product-neutral way to move a whole instance's data into or
out of passalong. It is deliberately generic: passalong contains **no** source-application-specific
logic. Converting another application's data into this format is a separate tool that lives outside
this product (`docs/` and the repository root do not ship one).

- Format name: `passalong-instance-exchange`
- Format version: `1`
- Checksum algorithm: `sha256`

An archive is a ZIP file with this layout:

```
manifest.json          metadata, counts and per-file checksums
data.json              the logical content of every user
media/...              image and avatar payloads
```

## manifest.json

```json
{
	"format": "passalong-instance-exchange",
	"version": 1,
	"archiveId": "uuid",
	"createdAt": "2026-09-15T12:00:00.000Z",
	"producerId": "whoever-produced-the-archive",
	"checksumAlgorithm": "sha256",
	"counts": {
		"users": 2,
		"tenants": 2,
		"collections": 2,
		"items": 3,
		"marketDays": 2,
		"sales": 0,
		"expenses": 1
	},
	"media": { "files": 3, "bytes": 123456 },
	"files": {
		"media/example/photo-1.jpg": { "sha256": "…", "bytes": 4567 }
	}
}
```

`files` covers **every** entry in the archive except `manifest.json` itself, including `data.json`.
A reader must reject an archive whose recorded checksums or sizes do not match the payloads.

### Media orientation

Media payloads are stored as delivered, so an archive carries whatever bytes its producer wrote —
including the EXIF `Orientation` tag a camera records instead of rotating the pixels. Orientation is
not normalized during import, which keeps the import byte-true and its checksums meaningful.

Rotation is applied once, on the way out, when a viewer requests the file (`/media/<key>`). That
single delivery step covers every channel that ever wrote media — upload, account transfer, instance
import, restore, and files stored before this rule existed.

### Version rules

- The format version is independent of the database schema version.
- An unknown **major** version is rejected outright; nothing is guessed.
- A supported older version keeps permanent regression tests and fixtures. Missing optional fields
  of an older supported version receive documented defaults; required fields are never invented.
- Any format migration runs before anything is written to live storage.

## data.json

```json
{
	"users": [
		{
			"sourceId": "u1",
			"username": "avery",
			"displayName": "Avery",
			"passwordHash": null,
			"passwordResetRequired": true,
			"avatarFile": "media/u1/avatar.jpg",
			"collections": [
				{
					"sourceId": "u1-collection-1",
					"name": "Flohmarkt",
					"standIntro": "…",
					"isPublished": true,
					"marketDays": [
						{
							"sourceId": "u1-day-1",
							"name": "Samstag",
							"date": "2026-09-05",
							"startTime": "08:00",
							"endTime": "14:00",
							"location": "Parkplatz",
							"notes": "",
							"closedAt": null
						}
					],
					"items": [
						{
							"title": "Vintage-Lampe",
							"priceCents": 2500,
							"category": "home",
							"condition": "used",
							"internalNotes": "",
							"externalDescription": "",
							"isComplete": true,
							"isFunctional": true,
							"reservedAt": null,
							"saleChannel": null,
							"soldAt": null,
							"saleProceedsCents": null,
							"marketDaySourceId": "u1-day-1",
							"images": [{ "file": "media/u1/photo-1.jpg", "position": 0, "isCover": true }]
						}
					],
					"expenses": [
						{
							"label": "Standgebühr",
							"category": "stand-fee",
							"amountCents": 1200,
							"expenseDate": "2026-09-05",
							"marketDaySourceId": "u1-day-1"
						}
					]
				}
			]
		}
	]
}
```

Every `sourceId` is an **archive-local** identifier. A reader must never treat one as a database key:
it maps each source id to a freshly generated internal id and rewrites every reference through that
mapping. References between records use those local ids, never usernames or file names.

`category`, `condition`, `saleChannel` and expense `category` must hold values the target product
supports; an unsupported value blocks activation rather than being silently coerced.

## How a reader must behave

1. **Reject on structure first.** Refuse traversal paths (`../`), absolute paths, symlinked entries,
   duplicate entry names, oversized archives/entries/extracted totals, and implausible compression
   ratios before parsing any content.
2. **Verify integrity.** Check every recorded checksum and size against the payload.
3. **Validate completely, change nothing.** Build a full report — counts, media totals, per-user
   password status, public stand pages, errors and warnings — without touching live data.
4. **Require exactly one administrator.** The operator picks one imported user; that account receives
   a freshly set password, because a foreign hash is never trusted.
5. **Activate atomically.** Apply everything inside one transaction and roll back completely on any
   failure, including any media written during the attempt.

## Password hashes

- Plaintext passwords never appear in an archive.
- A hash is carried over only when it is a native, strictly parseable passalong hash.
- Any other value (for example another application's digest scheme) is **never** stored: the account
  is imported and marked as requiring a password reset.
- The selected administrator always receives a new password before activation, so an incompatible
  admin hash cannot lock the operator out of the instance.

## Deliberate limits of this version

- **No publication flag.** Neither passalong nor the products it replaced track a per-stand
  visibility switch: a stand page is public exactly when its identifier is known. `isPublished` is
  carried in the format so nothing is lost, and the import reports which stand pages were public.
- **No delta import.** A takeover is a one-time, complete move. There is no incremental
  synchronisation.
- **One takeover per empty instance.** Activation refuses to run once any account exists; the
  operator must start from a fresh instance as described in the takeover steps.
