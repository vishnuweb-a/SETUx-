# Change Details — Citizen Entry Flow

Change & Correction Service, **Phase 3** (the citizen-facing half of the entry
flow whose backend `docs/PHASES/feature.md` records as Phase 2).

Feature module: `frontend/src/features/change-details/`.
Backend contract: `docs/API/citizen-records.md` (unchanged by this phase).

This phase **reads**. It creates no correction request, proposes no value and
issues no mutating request — see §6.

---

## 1. What the citizen can do

```
Citizen Dashboard
      ↓
Change Details                          /citizen/change-details
      ↓
their linked government records
      ↓
select one record                       /citizen/change-details/:recordId
      ↓
see every field, and which may be changed
      ↓
select one or more permitted fields
      ↓
Continue                                /citizen/change-details/:recordId/fields
```

The flow ends at a **selection**. Entering new values, attaching evidence,
choosing where a change propagates, consent, review and submission all belong to
later phases.

---

## 2. Routes

| Route | Screen |
| --- | --- |
| `/citizen/change-details` | Record chooser — the citizen's whole inventory. |
| `/citizen/change-details/:recordId` | One record, its fields, and field selection. |
| `/citizen/change-details/:recordId/fields` | Phase 3 handoff — the selection, confirmed. |

All three sit inside the existing citizen branch of
`frontend/src/app/router/routes.tsx`, behind the same guards every other citizen
screen uses: `ProtectedRoute` (session + `CITIZEN` role) → `RequireOnboarding`
(onboarding `COMPLETED`) → `CitizenLayout`. No new routing style, no second
shell, and no new guard.

Navigation entry: a **Change Details** item in the existing citizen sidebar,
alongside Dashboard, Services and My Applications, plus a card on the citizen
dashboard. Nothing else in the navigation changed.

---

## 3. Field eligibility

Every field of a record is displayed — including the ones that cannot be
changed. A citizen correcting a record needs to see the whole record, and
"this cannot be changed here, and here is who owns it" is a more useful answer
than an absent row.

| Server policy | Presentation | Selectable |
| --- | --- | --- |
| `EDITABLE` | "Editable" badge; *You can request a change to this field.* | Yes |
| `CONDITIONALLY_EDITABLE` | "Conditionally editable" badge; the requirement named in words | Yes |
| `IMMUTABLE` | "Locked" badge + lock icon; the owning authority named | No |
| *no active policy* (`editability: null`) | "Not available for change"; explains no policy exists | No |
| unrecognised value | treated exactly as *no policy* | No |

A conditional field's helper text is built from the policy's own
`requiresEvidence` / `requiresReview` flags:

- evidence only → *This change requires supporting evidence.*
- review only → *This change requires department review.*
- both → *This change requires supporting evidence and department review.*
- neither recorded → *This change may need additional checks before it is accepted.*

The last line states what is certain rather than inventing a condition the
policy does not express.

**Colour is never the only signal.** Every badge carries words; locked fields
additionally carry a lock icon and a full explanatory sentence.

---

## 4. Editability is never derived in the frontend

`frontend/src/features/change-details/utils/field-eligibility.ts` reads
`field.editability` and `field.changeable` exactly as the API returned them.
Nothing infers editability from a field's name, type or value, and nothing
widens a policy.

Two consequences worth stating:

1. A policy edit takes effect on the next load, with no frontend deploy.
2. An unrecognised editability is treated as **locked**, not guessed at, so a
   policy class added later cannot become silently selectable in an older
   frontend.

Where `changeable` and `editability` could ever disagree, the restrictive half
wins: an `IMMUTABLE` field is never selectable regardless of `changeable`.

---

## 5. Client/server trust boundary

**The selection made on this screen is a convenience, never an authority.**

The client-side guard in `useFieldSelection` keeps the UI honest; it is not a
security boundary. The phase that accepts a proposed value **must** re-check
every submitted field key server-side:

```ts
assertFieldEditable(recordType, fieldKey)
```

This is required, not advisory, because:

- a policy can change between this screen being rendered and a draft being
  submitted;
- a forged or modified client can send any field key it likes, and never has to
  render this screen at all;
- the frontend's list of selected keys arrives in a request body, which is
  user input like any other.

The Phase 1 helper already throws `409 FIELD_NOT_EDITABLE` on an immutable
field and `404 FIELD_POLICY_NOT_FOUND` on an absent policy, so the enforcement
the next phase needs exists and only has to be called.

---

## 6. No persistence, no mutation

| | |
| --- | --- |
| Database migration | **None.** Phase 3 adds no table, column, enum or policy. |
| Correction request | **Not created.** `change_requests` does not exist yet. |
| Proposed values | **Not collected.** No input accepts one. |
| Mutating request | **None.** The service module exports two GETs and nothing else. |
| Selection storage | React state, handed on in router state. |

The selection is deliberately **not** persisted. A draft that survives a reload
is Phase 4's concern, and inventing a table to hold a transient selection would
make that decision early and in the wrong place.

Because nothing is persisted, opening the handoff route directly — a reload, a
bookmark, a pasted link — has no selection to restore, and redirects back to the
record rather than rendering an empty page.

Selected field keys travel in **router state, not the URL**. Field keys in a
query string would be a durable, shareable, proxy-logged record of which of
their personal details a citizen believes are wrong, in exchange for a value
that is meaningful for exactly one navigation.

---

## 7. States

**Record list** — skeleton while loading; an empty state when the citizen has no
linked record (a 200 with zero items, not an error); an error state with retry.

**Record detail** — skeleton while loading; a *Record not found* state for a 404;
an error state with retry for anything else; a note when a record has no
correctable field at all, naming who to approach instead.

A record belonging to another citizen returns the same 404 as an id that never
existed, and the not-found copy is written so it cannot hint otherwise.

---

## 8. Accessibility

- One `<h1>` per page; the shell's header strip is a `<p>`, not a competing heading.
- Selectable fields are real `<input type="checkbox">` elements wrapped in a
  `<label>`, so the accessible name is the field's own label and keyboard
  selection works without any custom key handling.
- Each checkbox is `aria-describedby` its helper text, so the requirement is
  announced with the field rather than found separately.
- Immutable fields render **no control at all** rather than a disabled one, and
  carry a sentence explaining why — the lock icon is never the only indication.
- The selected count is an `aria-live="polite"` region, so ticking a box far up a
  long list is confirmed to a screen-reader user.
- Breadcrumbs are a labelled `<nav>` with `aria-current="page"` on the last item.
- No positive `tabindex` anywhere; focus styling is the project's existing
  `focus-visible:ring-2`.

---

## 9. Responsive behaviour

Record cards are a single column below `sm` and two columns above it. The action
bar is fixed to the foot of the viewport so Continue stays reachable while the
field list scrolls, and the page reserves bottom padding so the bar never covers
the last field. The sidebar keeps the existing drawer behaviour unchanged.

---

## 10. Bank details

`BANK_DETAILS` appears as an ordinary linked record. Its `authority` is `null`
because the synthetic bank is a **provider, not a department** — it has no
officer queue — so the UI says *Handled directly by the provider* rather than
inventing an authority.

No OTP, step-up modal, bank authorization or connector exists in this phase.
The provider is labelled as simulated wherever it appears.

---

## 11. Automated verification — 2026-09-08

Resumed testing of the uncommitted citizen entry flow. The first focused run
passed 44 of 45 tests and exposed a stale source-label assertion: the fixture's
name already contains `(Mock)`, so `sourceLabel` correctly avoids appending a
second simulation marker. Updated the test to assert the source name and the
separate visible `Simulated` badge. No application code changed during this
verification pass.

| Check | Result |
| --- | --- |
| Change Details tests (included in the full frontend run) | 45 passed |
| Full backend unit/integration suite | 705 passed, 36 files |
| Full frontend suite | 321 passed, 28 files |
| `npm.cmd run typecheck` | Passed for both workspaces |
| `npm.cmd run lint` | Passed for both workspaces |
| `npm.cmd run build` | Passed for both workspaces |

Frontend typecheck and lint also passed after the assertion edit. The initial
focused test command could not load its configuration inside the Windows
sandbox; the test runs above used the approved execution outside that sandbox.

Non-failing output remains: jsdom's unimplemented `scrollTo` in catalogue
pagination, React `act` warnings in an onboarding test, dependency annotation
warnings from Zod, and Vite's large-chunk warning.

This pass did not run the opt-in live database suite, probe live RLS policies,
or perform browser end-to-end/visual checks. The passing backend tests use
test doubles and do not establish live database authorization. The feature
still ends at field selection; correction drafts and submission are not
implemented by this entry flow.
