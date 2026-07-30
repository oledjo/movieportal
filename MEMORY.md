## 2026-07-30 — Todoist resources refresh manually
**What was decided:** Persist Movies and Books from Todoist in separate browser caches. Fetch the active tab automatically only when its cache is absent, and otherwise update it only through the existing refresh button.
**Why:** Avoid unnecessary Todoist requests on page loads and mode switches while keeping an explicit way to obtain current data.
**What was rejected:** Session-only caching because it still fetches after every page reload, and IndexedDB because it adds unnecessary complexity for these lists.

## 2026-07-30 — Load artwork without blocking cached content
**What was decided:** End the full-page loader as soon as the active Todoist list is available, then load movie posters or book covers in the background with the existing artwork progress indicator.
**Why:** Cached Todoist resources should appear immediately instead of waiting several seconds for batched artwork enrichment.
**What was rejected:** Removing only the artificial batch delays because artwork processing would still block the page, and skipping artwork refresh entirely because cards still need metadata and images.
