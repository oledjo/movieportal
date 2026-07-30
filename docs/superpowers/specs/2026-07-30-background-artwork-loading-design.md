# Background Artwork Loading Design

## Goal

Show cached or newly fetched Todoist Movies and Books as soon as their resource list is available. Poster and cover enrichment must continue in the background without keeping the application behind the full-page loading screen.

## Loading Boundary

The full-page `loading` state covers only the active Todoist resource list:

- If a valid Todoist cache exists, render it immediately.
- If no valid cache exists, keep the full-page loading screen until the first Todoist fetch succeeds or fails.
- After assigning the Movies or Books list, end the full-page loading state before starting artwork enrichment.

TMDB poster loading and Open Library/Google Books cover loading continue to use the existing `loadingPosters` state and progress indicator. They must not set or extend the full-page `loading` state.

## Data Flow

`loadMovies()` and `loadBooks()` remain responsible for loading and assigning the active Todoist resource list. On success they return after scheduling the corresponding artwork load in the background rather than awaiting it.

The existing `loadPosters()` and `loadBookCovers()` functions remain responsible for artwork state, progress, cache use, and error logging. Their completion may update cards after the list is already visible.

Manual refresh keeps its current ordered behavior: refresh the active Todoist list first, then clear and await the relevant artwork refresh. This preserves the existing refresh completion toast and prevents artwork from being cleared when Todoist refresh fails.

## Error Handling

- A Todoist failure with no usable list keeps the current full-page error behavior.
- An artwork failure is non-blocking: the already-rendered resource list remains visible, and artwork loaders continue logging their existing errors.
- A background artwork promise must be handled so it cannot create an unhandled rejection.
- Switching modes while artwork is loading must not restore the full-page loader for a mode whose Todoist list is already available.

## Testing

Add focused component tests for both Movies and Books using controllable artwork promises:

- Resolve the Todoist resource load while leaving artwork unresolved.
- Verify the resource card is visible and the full-page loading message is absent before artwork resolves.
- Resolve artwork and verify the background operation completes normally.

Run the full automated suite, production build, and whitespace checks. Preserve existing manual-refresh ordering tests.

## Scope

Do not change Todoist caching, manual-refresh semantics, artwork cache expiry, batch sizes, artificial artwork delays, filters, scheduling, or Todoist write behavior. Optimizing the internal artwork batch loops is a separate task.
