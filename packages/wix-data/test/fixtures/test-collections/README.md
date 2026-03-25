# Test Collections for wix-data Plugin

Test data covering the full surface area of the wix-data plugin:
schema processing, contract generation, field mapping, list rendering, and configuration.

## Files

```
schemas.json          Wix Data API collection schemas (7 collections)
wix-data.yaml         Plugin configuration (3 visible + 4 supporting)
data/
  article-categories.csv   4 categories
  authors.csv              3 authors
  departments.csv          4 departments
  venues.csv               3 venues
  articles.csv             12 articles
  team-members.csv         6 team members
  events.csv               7 events
```

## What Each Collection Tests

### Articles (visible, full-featured)

| Aspect                  | How it's tested                                                |
| ----------------------- | -------------------------------------------------------------- |
| Field whitelist (DL#09) | indexPage: [title, coverImage, excerpt, publishDate, readTime] |
| Category pages (DL#08)  | MULTI_REFERENCE `categories` → ArticleCategories               |
| Embedded reference      | `author` with mode: embed → Authors collection                 |
| RICH_CONTENT exclusion  | `body` field excluded from list/card, included in item         |
| IMAGE field             | `coverImage` with wix:image:// URLs + dimensions               |
| DATE field              | `publishDate` as string                                        |
| BOOLEAN field           | `published` — art-7 is unpublished (draft)                     |
| NUMBER field            | `readTime`                                                     |
| Smart defaults          | title="title", image auto-detects "coverImage"                 |
| Pagination (DL#08)      | 12 items > PAGE_SIZE of 10 → tests load more                   |
| Missing image           | art-7 has no coverImage (null handling)                        |
| Multi-category          | art-1 in [tech, design], art-5 in [culture, business]          |
| Single category         | art-2 in [design] only                                         |

### TeamMembers (visible, people directory)

| Aspect             | How it's tested                                        |
| ------------------ | ------------------------------------------------------ |
| ADDRESS field      | `office` with {formatted, city, country} sub-contract  |
| TAGS field         | `skills` as comma-separated tags                       |
| URL field          | `linkedin` — tm-4 and tm-6 have no LinkedIn (null)     |
| RICH_TEXT field    | `bio` — excluded from list by whitelist                |
| Embedded reference | `department` → Departments collection                  |
| Field whitelist    | indexPage: [name, photo, title, department]            |
| Missing photo      | tm-6 has no photo (new hire)                           |
| Missing URL        | tm-4 and tm-6 have no LinkedIn                         |
| Smart defaults     | name="name" (not "title" since "title" is job title)   |
| No categories      | No category config — tests codepath without categories |

### Events (visible, no field whitelist)

| Aspect             | How it's tested                                        |
| ------------------ | ------------------------------------------------------ |
| DATETIME field     | `startDate`, `endDate` with ISO 8601 timestamps        |
| NUMBER fields      | `price` (0 for free), `capacity` (null for unlimited)  |
| BOOLEAN fields     | `isFeatured`, `isVirtual`                              |
| VIDEO field        | `promoVideo` with wix:video:// URLs — some null        |
| URL field          | `registrationUrl` — some null                          |
| Embedded reference | `venue` → Venues, evt-3/evt-6 have no venue (virtual)  |
| No field whitelist | indexPage: true — all card-eligible fields in contract |
| Table widget       | tableWidget: true — tests table contract generation    |
| Missing fields     | evt-4: no image, no video, no registration URL         |
| Past events        | evt-7: date in the past                                |
| Free events        | evt-3, evt-4: price=0                                  |
| Null capacity      | evt-3, evt-6: virtual events with no capacity          |
| Null venue ref     | evt-3, evt-6: virtual events with no venue             |

### Supporting Collections (not visible)

| Collection        | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| ArticleCategories | Category target for Articles.categories MULTI_REFERENCE |
| Authors           | Embed target for Articles.author REFERENCE              |
| Departments       | Embed target for TeamMembers.department REFERENCE       |
| Venues            | Embed target for Events.venue REFERENCE                 |

These are set to `visible: false` — no contracts generated, but schemas
are fetched when processing embedded references in visible collections.

## Field Type Coverage

| Wix Type        | Collections using it                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------- |
| TEXT            | All                                                                                             |
| NUMBER          | Articles (readTime), TeamMembers (yearsExperience), Events (price, capacity), Venues (capacity) |
| BOOLEAN         | Articles (published), Events (isFeatured, isVirtual)                                            |
| DATE            | Articles (publishDate), TeamMembers (startDate)                                                 |
| DATETIME        | Events (startDate, endDate)                                                                     |
| IMAGE           | Articles, Authors, TeamMembers, Events, Venues                                                  |
| VIDEO           | Events (promoVideo)                                                                             |
| URL             | Authors (website), TeamMembers (linkedin), Venues (website), Events (registrationUrl)           |
| RICH_TEXT       | TeamMembers (bio)                                                                               |
| RICH_CONTENT    | Articles (body)                                                                                 |
| REFERENCE       | Articles→Authors, TeamMembers→Departments, Events→Venues                                        |
| MULTI_REFERENCE | Articles→ArticleCategories                                                                      |
| ADDRESS         | TeamMembers (office), Venues (address)                                                          |
| TAGS            | TeamMembers (skills)                                                                            |

Not covered (rare/unsupported in current plugin): AUDIO, DOCUMENT, ARRAY, OBJECT, TIME.

## Edge Cases in Data

- **Null/missing values**: photo (tm-6), coverImage (art-7), promoVideo (evt-2,4), venue (evt-3,6), linkedin (tm-4,6), registrationUrl (evt-4), website (author-3), capacity (evt-3,6), contactEmail coverage varies
- **Unpublished item**: art-7 has published=false
- **Zero values**: price=0 for free events (evt-3,4)
- **Past dates**: evt-7 in Dec 2025
- **Multi-value references**: art-1 in 2 categories, art-5 in 2 categories
- **Quoted CSV values**: descriptions containing commas and quotes (author-2 bio)
- **wix:image:// URLs**: All images use the Wix media protocol format with originWidth/originHeight
