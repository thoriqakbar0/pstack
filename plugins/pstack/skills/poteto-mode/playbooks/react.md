### React

**You own the component's behavior off the happy path.** Run this beside Feature, Bug fix, or Refactoring when the change adds or edits a React component. It adds the hardening pass. The other playbook still owns design and delivery.

1. List every environment the component can render in, as one todo item: server render, hydration, client-only mount, a Server Component parent, StrictMode, a portal, a pop-out window or iframe, a hidden `<Activity>`, several instances on one page. Mark each `n/a: <reason>` rather than dropping it.
2. Check each changed component against these invariants. Fix a violation before step 3.
   - **Render reads nothing one environment lacks.** No `window`, `document`, `localStorage`, `navigator`, `matchMedia`, or markup derived from `Date.now()` or `Math.random()` during render. Read client-only values in an effect, or through `useSyncExternalStore` with a `getServerSnapshot`.
   - **The first client render matches the server HTML.** A value known only on the client either renders after mount, or sets the DOM before hydration from a blocking inline script with `suppressHydrationWarning` on that element. Pick by whether a flash is acceptable.
   - **Every effect that escapes the fiber returns its inverse.** Listeners, timers, subscriptions, observers, injected styles, and `document` mutations each have a cleanup that restores the prior state. StrictMode's mount, unmount, mount must leave one copy.
   - **Effects target the component's own document.** Use `node.ownerDocument` and `ownerDocument.defaultView`, never the global `window` or `document`, so a portal into a pop-out or iframe still works. DOM IDs come from `useId`.
   - **Props crossing `"use client"` carry nothing private.** Every prop a Server Component passes to a Client Component is serialized into the Flight payload the browser receives. Pass the fields the client renders. Keep secrets in modules that `import "server-only"`.
   - **`"use client"` sits on the smallest interactive leaf.** A boundary high in the tree ships its whole subtree as client JavaScript.
   - **Update priority matches intent.** Input the user is typing or pointing at stays urgent. The expensive rerender it triggers goes through `startTransition` or `useDeferredValue`. Leave cheap updates alone.
   - **Memoization is a hint.** `useMemo`, `useCallback`, and `memo` may recompute. No correctness depends on a memoized value's identity.
3. Exercise each environment from step 1 on the real app through the matching driver skill, or a scratch page when none exists: server render and hydrate with the console open for hydration warnings, StrictMode, two instances, a portal into a second window, `<Activity>` hidden then visible, unmount then remount. After unmount, confirm no listener, timer, or style survives. Apply the **prove-it-works** principle skill. A case you could not run stays listed as unverified.
4. A performance claim needs a browser trace before and after: layout, style recalculation, long tasks, paint. React render counts alone do not show the dominant cost. Route sustained perf work to Perf issue (`playbooks/perf-issue.md`).
5. Run **Opening a PR**.

**Reply:** the environments covered, the invariant violations found and fixed, each exercised case with its result, and the cases left unverified.
