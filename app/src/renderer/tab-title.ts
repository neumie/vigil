// Tab title arbitration — pure, DOM-free, plain-node testable (renderer.ts
// consumes it; tests/helm-tab-title.test.ts exercises it directly).
//
// Two mechanisms decided here:
//
// 1. PIN (manual rename): a tab renamed by hand carries a `customName` (session
//    registry, separate field from `lastTitle`). While pinned, NO OSC title is
//    ever applied to the label — the live OSC title survives only as the
//    label's tooltip. Clearing the name unpins and OSC follow resumes.
//
// 2. RESTORED-TITLE STICKINESS: after a dtach reattach the saved registry
//    title must survive the attach chatter. Diagnosis (2026-07, instrumented
//    against real dtach + zsh/oh-my-zsh):
//      - oh-my-zsh emits OSC 2 `user@host` at EVERY idle prompt — which
//        normalizeTabTitle maps to the literal fallback 'zsh'. Any such
//        "shell default class" title arriving right after reattach (a TUI's
//        WINCH repaint, shell-integration chatter) would stamp 'zsh' over the
//        restored label AND the registry entry, so the loss compounds across
//        relaunches.
//      - a plain zsh sitting at a prompt emits NOTHING on reattach (verified:
//        the -r winch redraw and the cols-1→cols nudge produce no OSC), so
//        suppression must never be needed for the label to survive that case —
//        it guards the noisy-program cases.
//    Rule: for a short window after the pty attaches (TITLE_STICKY_WINDOW_MS),
//    an incoming title that normalizes into the shell-default class ('zsh')
//    does NOT overwrite a restored tab's label. A REAL title (anything
//    non-default — a TUI re-asserting its name, a running command) applies
//    immediately, even inside the window, and settles the tab: from then on
//    every title applies (live following is fully restored). After the window
//    expires, default-class titles apply too — a prompt shown because the
//    user pressed Enter is the live truth, not attach chatter. Fresh
//    (non-restored) tabs never suppress: today's behavior exactly.

/** Suppression window for shell-default titles after a reattach. */
export const TITLE_STICKY_WINDOW_MS = 3000

// Shell OSC titles usually arrive as "user@host:cwd" — noise at tab width.
// Normalize to the trailing path segment ("helm"); a bare "user@host" (no
// path) falls back to "zsh". Anything else (ssh banners, app-set titles)
// passes through untouched. The raw title survives as the label's tooltip.
export function normalizeTabTitle(raw: string): string {
	const text = raw.trim()
	if (!text) return 'zsh'
	if (!/^\S+@\S+(:.*)?$/.test(text)) return text
	const colon = text.indexOf(':')
	const path = colon === -1 ? '' : text.slice(colon + 1).trim()
	const segment = path.replace(/\/+$/, '').split('/').pop() ?? ''
	return segment || 'zsh'
}

/**
 * The "shell default" title class: everything the normalizer collapses to the
 * 'zsh' fallback — empty titles, bare `user@host`, `user@host:` with an empty
 * path. These carry no information a restored label should lose to.
 */
export function isShellDefaultTitle(normalized: string): boolean {
	return normalized === 'zsh'
}

export interface TitleDecisionInput {
	/** Tab carries a manual name (registry `customName`) — OSC never applies. */
	pinned: boolean
	/** Tab reattached an existing dtach session (startup restore, grace-undo). */
	restored: boolean
	/** A non-default title already applied since the attach — chatter is over. */
	titleSettled: boolean
	/** ms since the pty spawn resolved (attach); -Infinity while still spawning. */
	sinceAttachMs: number
	/** Incoming OSC title, already run through normalizeTabTitle. */
	incoming: string
	/** Test override for the suppression window. */
	stickyWindowMs?: number
}

/** True = apply the incoming title to the label (and persist it). */
export function decideTabTitle(input: TitleDecisionInput): boolean {
	if (input.pinned) return false
	if (!input.restored || input.titleSettled) return true
	if (!isShellDefaultTitle(input.incoming)) return true
	return input.sinceAttachMs >= (input.stickyWindowMs ?? TITLE_STICKY_WINDOW_MS)
}
