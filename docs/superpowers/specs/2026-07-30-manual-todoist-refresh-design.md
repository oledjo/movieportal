# Manual Todoist Refresh Design

## Goal

Stop fetching Todoist resources on every page load and content-mode switch. Persist the last successful Movies and Books lists in the browser, and update only the active list when the user presses the existing refresh button.

## Scope

- Cache Todoist Movies and Books separately in `localStorage`.
- Automatically fetch the active list once when it has no valid cache.
- Use cached Todoist data on later page loads and when switching between Movies and Books.
- Make the existing header refresh button reload the active Todoist list and its associated artwork.
- Keep cached data synchronized after existing local Todoist actions.
- Invalidate both Todoist caches when the Todoist token changes.

No unrelated UI, filtering, Todoist parsing, scheduling, or media metadata behavior will change.

## Data Storage

Use two versioned `localStorage` entries: one for Movies and one for Books. Each entry contains the cache version and the parsed resource array. The cache does not expire automatically because refresh is intentionally manual.

Cache reads must validate the stored shape. Missing, malformed, or incompatible entries are discarded and treated as an empty cache. Cache failures must not prevent the application from loading.

The Todoist API token is not stored inside either resource-cache entry. When the saved token changes, both cached resource entries are removed so data from the previous account cannot be displayed under the new account.

## Loading Flow

On application mount and on content-mode changes:

1. Read the cache for the active mode.
2. If valid cached data exists, display it without calling Todoist.
3. If no valid cache exists, fetch the active mode from Todoist once, display it, and save it.
4. Load TMDB posters or book covers through their existing cache-aware services.

An empty array returned successfully by Todoist is valid cached data and must not cause repeated automatic requests.

Saving settings uses the same flow. An unchanged token reuses the current cache. A changed token clears both resource caches, then performs the automatic first fetch for the active mode.

## Manual Refresh

The existing header refresh button becomes a full refresh for the active mode:

1. Fetch the active resource list from Todoist.
2. Only after a successful response, replace the displayed list and its persisted cache.
3. Clear and reload the relevant artwork cache: TMDB for Movies, Open Library/Google Books for Books.
4. Show a success toast describing the refreshed active mode.

The button uses the existing loading state to prevent duplicate clicks. Its title and accessible label describe refreshing Movies or Books rather than only posters or covers.

## Local Mutations

Existing Todoist actions continue updating the visible arrays optimistically. Whenever the Movies or Books array is changed by marking an item watched/read, undoing that action, or changing a movie due date, save the updated array to the corresponding resource cache. This prevents a normal reload from restoring stale cached state.

No new Todoist write requests are introduced.

## Error Handling

- If a manual refresh fails, preserve the previous displayed and cached list and show an error toast.
- Artwork refresh occurs only after the Todoist fetch succeeds.
- If the first automatic fetch fails and no cache exists, keep the existing full-page error state.
- Malformed cache data is removed and recovered through the normal first-fetch path.
- `localStorage` read/write failures are logged but do not crash the application.

## Testing

Add focused automated tests for the cache boundary and loading decisions:

- Valid cached Movies and Books are restored without a Todoist request.
- Missing or malformed cache data triggers the one-time automatic fetch.
- A successful empty list is cached and does not refetch on reload.
- Manual refresh affects only the active mode and replaces its cache after success.
- Failed manual refresh preserves the previous data and cache.
- Changing the Todoist token invalidates both resource caches.
- Existing local mutations persist their updated lists.

Run the automated test suite and the production build. Manually verify page reload, mode switching, refresh labels, loading state, success toast, and failed-refresh fallback.

