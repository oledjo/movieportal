## 2026-07-30 — Todoist resources refresh manually
**What was decided:** Persist Movies and Books from Todoist in separate browser caches. Fetch the active tab automatically only when its cache is absent, and otherwise update it only through the existing refresh button.
**Why:** Avoid unnecessary Todoist requests on page loads and mode switches while keeping an explicit way to obtain current data.
**What was rejected:** Session-only caching because it still fetches after every page reload, and IndexedDB because it adds unnecessary complexity for these lists.
