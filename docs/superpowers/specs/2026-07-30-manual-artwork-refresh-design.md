# Manual Artwork Refresh Design

## Goal

Reuse cached movie posters and book covers without running network-capable batch enrichment on every page load. Fetch artwork automatically only when no valid artwork cache exists, including after the existing 30-day cache expiry. Once populated, update artwork only through the existing Refresh button.

## Cache Policy

TMDB and Open Library keep their existing browser-local caches, cache keys, versions, and 30-day expiry. Each service also exposes whether it loaded a valid cache and a cache-only way to resolve the current Todoist resources.

A valid cache remains authoritative for normal page loads even when it has no entry for a newly added resource. Missing entries render without artwork until manual Refresh. Cached `null` search results also remain valid cache entries and are not searched again automatically.

Cache-only reads must not call TMDB, Open Library, or Google Books, run rate-limit delays, save the cache again, or extend its expiry.

## Normal Loading

After Movies or Books are available from Todoist:

- If the corresponding artwork cache is valid, resolve the current cards only from that cache and assign the resulting task-ID map immediately.
- If the cache is absent, malformed, version-incompatible, explicitly cleared, or expired, run the existing network-capable artwork batch once in the background and persist its results.
- The Todoist list remains visible throughout artwork work; the full-page loader is not restored.
- Cache-only hydration does not show a multi-second artwork progress state because it performs no network work or inter-batch delay.

Movie cache-only resolution follows the same normalized title, year, movie-first, and series fallback keys as the current TMDB search. Book cache-only resolution follows the same normalized title and author key as the current Open Library search. This prevents a second cache representation from drifting from the existing services.

## Manual Refresh

The Refresh button keeps its current ordered workflow:

1. Refresh the active Todoist resource list.
2. If Todoist succeeds, clear the active artwork cache.
3. Run and await a full network-capable artwork batch.
4. Show the existing completion notification.

Clearing the artwork cache marks it unavailable immediately. The successful batch marks it valid again when its results are saved. If the batch rejects unexpectedly, the resource list stays visible and the cache remains unavailable so a future page load can retry. Existing per-item no-result behavior remains unchanged.

## Service Boundaries

`tmdb.js` and `openlib.js` own cache validity and cache-key lookups. They expose small cache-inspection and cache-only batch functions rather than exposing their internal `Map` objects.

`App.vue` chooses between cache-only hydration and the existing full artwork loaders. It continues to own task-ID artwork maps, progress state, background error handling, and manual-refresh sequencing.

No additional localStorage artwork snapshot is introduced.

## Testing

Add service tests for both artwork providers covering:

- a valid cache resolves current resource IDs without any network request;
- a missing resource returns no artwork without falling through to the network;
- an absent, malformed, incompatible, or expired cache reports unavailable;
- clearing and saving update cache availability correctly.

Add component tests for Movies and Books covering:

- valid artwork cache uses cache-only hydration and skips network-capable batches;
- missing or expired artwork cache starts one automatic background batch;
- manual Refresh still clears and awaits a full artwork refresh;
- cache-only hydration does not block rendering of the Todoist cards.

Run the complete test suite, production build, and whitespace checks.

## Scope

Do not change Todoist caching, cache expiry duration, artwork matching rules, batch sizes, API rate-limit delays for real network batches, filters, scheduling, Todoist mutations, or card presentation. Race hardening for overlapping artwork requests remains a separate task.
