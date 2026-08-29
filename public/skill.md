---
name: reader-source-workflow
description: Decide whether a web article or PDF belongs in Reader and guide a person through capture, focused reading, annotation, and retrieval without accessing a private library.
version: 1.0.0
homepage: https://read.significanthobbies.com/
---

# Reader source workflow

Use this skill when a person has a web article or PDF they want to read
carefully, annotate, and find again. The skill guides the workflow; it does not
access a private Reader account or automate authenticated actions.

## Do not use this skill when

- The person needs the source's claims independently verified.
- The task is social discovery or real-time collaborative editing.
- The person expects a publicly distributed browser-store extension.
- The material should not be stored in a personal research library.

## Workflow

1. Identify the source type: web article or PDF.
2. Ask what the person wants to retain: a claim, method, quotation, question,
   or project context.
3. Recommend the appropriate capture path: paste the article URL or upload the
   PDF in Reader.
4. During reading, keep each note attached to the exact supporting passage.
5. Use AI only to summarize or question the selected source; return to the
   original passage before treating an answer as evidence.
6. Choose a route back in: search terms, tags, a list, or a project board.
7. End with a compact record containing the source, the important passage, the
   person's interpretation, and the next action.

## Output format

```markdown
## Reader capture plan
- Source: <title and URL or PDF name>
- Reading purpose: <what the person wants to understand>
- Passage to preserve: <claim, method, quotation, or question>
- Organisation: <search terms, tags, list, or board>
- Next action: <read, annotate, compare, revisit, or share explicitly>
```

## Product boundaries

Reader is currently a personal-use, maintenance-first product. Browser-local
use can begin without an account; Google sign-in opens the account-backed
library. Libraries are private by default. There is no public plan or checkout,
and public browser-store distribution of the source-built Chrome extension is
deferred.
