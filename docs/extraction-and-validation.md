# Programme extraction and validation

Source: the supplied 452-page WCPEC-9 programme, PDF SHA-256 `7cd93edc15ca9bdeb1acae8739f7b0e60622a36f7f9b20aecbe38a6b9aafd5c5`. Page references throughout this repository are physical PDF pages. The printed numbers in the programme differ.

| PDF pages | Use |
|---|---|
| 24–25, 73–74 | Conference overview and room/day columns. The poster-window cells in 24–25 were checked in rendered page crops. |
| 52–63 | Social events, tutorials and technical tour. The image-only social pages 52–53 were rendered and read using OCR. |
| 65–86 | Area names, plenary schedule and speaker directories. Directories were cross-references for roles and timing. |
| 87–164 | Daily room timetables and detailed oral, invited, keynote and plenary listings. Daily split tables are 87–88, 97–98, 115–116, 139–140 and 159–160. |
| 165–263 | Poster listings. Technical poster records are on pp. 166–262. |
| 265–288 | Workshop overview, individual schedule tables and coded speaker details. |
| 292, 352–355 | Exhibition and exhibition-stage events, timed talks and pitches. |
| 361–370, 372–443 | Logistics and author index used to distinguish scheduling content from operational material and indexes. |

The remaining pages were inventoried as front matter, awards profiles, venue maps, advertisements, exhibitor listings, separators, or other non-programme content. General venue logistics, exhibitor directories, shuttle schedules and biographies are outside the planner data.

The extractor uses positioned PDF text and typography to delimit codes, headings, titles, ordered bylines, and affiliations. It reconstructs authors and wrapped titles across broken text spans. Poster dates derive from the A, B and D listings, and their room and shared window come from the overview cells. The technical room join uses the date, code, column and time row. The schedule transcription records times for outreach presentations whose detailed blocks provide only codes, titles and authors. Where both a coded listing and a supplementary table describe the same entry, the coded record supplies the presentation. Separate uncoded scheduled talks carry a null code and a stable ID, with their schedule page as provenance.

## Coverage

| November | Sessions / events | Oral | Invited | Keynote | Plenary | Poster | Tutorial | Workshop | Presentations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 15 | 10 | 0 | 0 | 0 | 0 | 0 | 8 | 11 | 19 |
| 16 | 24 | 24 | 15 | 5 | 1 | 280 | 0 | 21 | 346 |
| 17 | 43 | 53 | 30 | 11 | 1 | 296 | 0 | 30 | 421 |
| 18 | 38 | 74 | 40 | 9 | 1 | 0 | 0 | 15 | 139 |
| 19 | 44 | 50 | 45 | 8 | 1 | 250 | 0 | 25 | 379 |
| 20 | 7 | 11 | 8 | 2 | 1 | 0 | 0 | 0 | 22 |
| **Total** | **166** | **212** | **138** | **35** | **5** | **826** | **8** | **102** | **1,326** |

Technical sessions and workshops can include multiple presentation types. Poster groups are listed by technical area and linked to the same evening window. Presentations count includes 50 uncoded programme-table items, including selected panels and stage pitches.

## Checks run

- Poppler’s independent layout extraction produced the same 1,276 coded presentation entries as the generated data, covering the detailed tutorial, oral, poster and outreach sections.
- A separate transcription of the room columns matched every one of the 87 coded technical sessions by date and code. All five plenary rooms are in the corresponding conference-day timetable and speaker listings.
- Twelve source comparisons cover every date and presentation type. They check exact titles, ordered bylines, codes, times, rooms and provenance. Examples include the 14-author poster `2-1-AP-01`, `5DO.15-OP-3` and the split timetable on Friday.
- The validator checked IDs, date and time values, session joins, room coverage, shared poster windows, daily counts and the two reported out-of-window talks. The checked data has zero duplicate presentation codes and zero orphan presentations.
- The [official online programme](https://wcpec-9.com/en/detailed_program) returned no readable schedule to the web retrieval used for cross-checking. The supplied PDF therefore remains the schedule source for this build.

The inventory is complete for the coded detail sections included in the PDF. Exact titles and ordered authors were spot-checked, so line wrapping and bylines can still contain extraction imperfections. Source conflicts, missing fields and supplementary event limitations are listed in [data issues](data-issues.md).
