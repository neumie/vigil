// Two-finger swipe-back for the push stack (docs/design-system.md §3.10
// gestures): macOS trackpads deliver horizontal pan as wheel events with
// deltaX. SwipeTracker is the pure gesture state machine (unit-tested from
// tests/helm-swipe.test.ts); attachSwipeBack is the DOM controller that drives
// the page transforms and owns gesture-boundary timing.
//
// Sign convention: with macOS natural scrolling, fingers moving RIGHT (the
// Safari back gesture) produce NEGATIVE wheel deltaX ("scroll toward the left
// edge of the content"). Back progress therefore accumulates -deltaX.

// --- tuning constants (documented in design-system.md §3.10) --------------------

/** Commit the pop once the page is dragged past this fraction of pane width. */
export const SWIPE_COMMIT_FRACTION = 0.5
/** …or on a flick: recent finger velocity above this (px/ms of back motion). */
export const SWIPE_FLICK_VELOCITY = 0.7
/** A flick still needs this much real travel — guards twitchy micro-swipes. */
export const SWIPE_MIN_FLICK_TRAVEL_PX = 40
/** No wheel events for this long = the gesture (incl. momentum tail) ended. */
export const SWIPE_WHEEL_IDLE_MS = 90
/** Quiet period after a gesture settles before a new one may start — eats the
 *  momentum tail so one long swipe can't pop two pages. */
export const SWIPE_COOLDOWN_MS = 250
/** Commit animation (rest of the travel) — matches the §2.5 enter clock. */
export const SWIPE_COMMIT_MS = 150
/** Spring back to rest when the gesture releases below the threshold. */
export const SWIPE_SPRING_BACK_MS = 160

// --- pure gesture core -----------------------------------------------------------

export type SwipeFeedResult = 'ignored' | 'started' | 'tracking'

/**
 * Accumulates one wheel-gesture's horizontal deltas into back-swipe progress.
 * The FIRST event decides the gesture's fate for its whole lifetime:
 * vertical-dominant → scroll, positive deltaX → forward-content pan, or a
 * consumer (horizontally scrollable ancestor / nothing to pop) → rejected.
 */
export class SwipeTracker {
	private readonly width: number
	private progress = 0
	private velocity = 0
	private lastTime: number | null = null
	private decided = false
	private active = false

	constructor(paneWidth: number) {
		this.width = Math.max(1, paneWidth)
	}

	feed(deltaX: number, deltaY: number, timeMs: number, canStart: () => boolean): SwipeFeedResult {
		if (!this.decided) {
			this.decided = true
			const horizontal = Math.abs(deltaX) > Math.abs(deltaY)
			if (!horizontal || deltaX >= 0 || !canStart()) return 'ignored'
			this.active = true
			this.progress = -deltaX
			this.velocity = 0
			this.lastTime = timeMs
			return 'started'
		}
		if (!this.active) return 'ignored'
		const dt = Math.max(1, timeMs - (this.lastTime ?? timeMs))
		this.lastTime = timeMs
		// EMA weighted toward recent motion so a release-flick registers even
		// after a slow drag; momentum decay pulls it back down naturally.
		this.velocity = this.velocity * 0.6 + (-deltaX / dt) * 0.4
		this.progress = Math.min(this.width, Math.max(0, this.progress - deltaX))
		return 'tracking'
	}

	/** True while this gesture is interactively dragging the page. */
	get tracking(): boolean {
		return this.active
	}

	get progressPx(): number {
		return this.progress
	}

	/** 0..1 of pane width. */
	get fraction(): number {
		return this.progress / this.width
	}

	/** Decision at gesture end: pop, or spring back. */
	shouldCommit(): boolean {
		if (!this.active) return false
		if (this.fraction >= SWIPE_COMMIT_FRACTION) return true
		return this.velocity >= SWIPE_FLICK_VELOCITY && this.progress >= SWIPE_MIN_FLICK_TRAVEL_PX
	}
}

// --- DOM controller ---------------------------------------------------------------

export interface SwipeBackHandlers {
	/** A pushed page exists, no push/pop animation is running, no sheet is open. */
	canPop(): boolean
	/** Top page + the page beneath it (the one that peeks). */
	getPages(): { top: HTMLElement; under: HTMLElement } | null
	/** Instant pop — the controller already animated the pages into place. */
	commitPop(): void
	reducedMotion(): boolean
}

/** True when an ancestor (target→viewport) can still scroll leftward and thus
 *  owns leftward horizontal pan — code blocks, log wells. At scrollLeft 0 the
 *  gesture falls through to navigation (Safari's edge rule). */
function hasHorizontalScrollConsumer(target: EventTarget | null, viewport: HTMLElement): boolean {
	let el = target instanceof Element ? target : null
	while (el && el !== viewport) {
		if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1 && el.scrollLeft > 0) {
			const overflowX = getComputedStyle(el).overflowX
			if (overflowX === 'auto' || overflowX === 'scroll') return true
		}
		el = el.parentElement
	}
	return false
}

/**
 * Wires interactive swipe-back onto the nav viewport. Finger-tracking writes
 * inline transforms (no easing); release either commits (animate out, then
 * `commitPop()`) or springs back. Returns a disposer.
 */
export function attachSwipeBack(viewport: HTMLElement, handlers: SwipeBackHandlers): () => void {
	let tracker: SwipeTracker | null = null
	let pages: { top: HTMLElement; under: HTMLElement } | null = null
	let scrim: HTMLDivElement | null = null
	let idleTimer: number | null = null
	let settleTimer: number | null = null
	/** 'animating' = commit/spring-back in flight; 'cooldown' = momentum tail. */
	let phase: 'idle' | 'gesturing' | 'animating' | 'cooldown' = 'idle'

	const clearTimer = (id: number | null) => {
		if (id !== null) clearTimeout(id)
	}

	const render = (fraction: number, px: number) => {
		if (!pages) return
		pages.top.style.transform = `translateX(${px}px)`
		// Under page parallaxes -25% → 0 as the top page reveals it (§3.10).
		pages.under.style.transform = `translateX(${-25 * (1 - fraction)}%)`
		if (scrim) scrim.style.opacity = String(1 - fraction)
	}

	const beginVisuals = () => {
		if (!pages) return
		pages.top.classList.add('nav-swiping')
		pages.under.classList.add('nav-swiping')
		scrim = document.createElement('div')
		scrim.className = 'swipe-scrim'
		pages.under.appendChild(scrim)
	}

	const cleanupVisuals = () => {
		if (pages) {
			for (const el of [pages.top, pages.under]) {
				el.classList.remove('nav-swiping')
				el.style.transform = ''
				el.style.transition = ''
			}
		}
		scrim?.remove()
		scrim = null
		pages = null
	}

	const enterCooldown = () => {
		phase = 'cooldown'
		clearTimer(settleTimer)
		settleTimer = window.setTimeout(() => {
			phase = 'idle'
		}, SWIPE_COOLDOWN_MS)
	}

	const finish = () => {
		idleTimer = null
		const done = tracker
		tracker = null
		if (!done?.tracking || !pages) {
			// Rejected gesture (vertical scroll / consumed pan): no cooldown —
			// the next distinct gesture may navigate immediately.
			cleanupVisuals()
			phase = 'idle'
			return
		}
		const commit = done.shouldCommit()
		if (handlers.reducedMotion()) {
			// Reduced motion: no tracked animation happened; pop instantly.
			cleanupVisuals()
			if (commit) handlers.commitPop()
			enterCooldown()
			return
		}
		phase = 'animating'
		const { top, under } = pages
		const ms = commit ? SWIPE_COMMIT_MS : SWIPE_SPRING_BACK_MS
		top.style.transition = `transform ${ms}ms ease-out`
		under.style.transition = `transform ${ms}ms ease-out`
		if (scrim) scrim.style.transition = `opacity ${ms}ms ease-out`
		// Next frame so the transition sees a start value.
		requestAnimationFrame(() => {
			if (commit) render(1, viewport.clientWidth)
			else render(0, 0)
		})
		settleTimer = window.setTimeout(() => {
			cleanupVisuals()
			if (commit) handlers.commitPop()
			enterCooldown()
		}, ms + 30)
	}

	const onWheel = (event: WheelEvent) => {
		if (phase === 'animating') return
		if (phase === 'cooldown') {
			// Momentum tail keeps the cooldown alive; a real pause ends it.
			enterCooldown()
			return
		}
		if (!tracker) {
			tracker = new SwipeTracker(viewport.clientWidth)
			phase = 'gesturing'
		}
		const result = tracker.feed(
			event.deltaX,
			event.deltaY,
			event.timeStamp,
			() => handlers.canPop() && !hasHorizontalScrollConsumer(event.target, viewport),
		)
		if (result === 'started') {
			pages = handlers.getPages()
			if (!pages) return
			if (!handlers.reducedMotion()) {
				beginVisuals()
				render(tracker.fraction, tracker.progressPx)
			}
			event.preventDefault()
		} else if (result === 'tracking') {
			if (!handlers.reducedMotion()) render(tracker.fraction, tracker.progressPx)
			event.preventDefault()
		}
		clearTimer(idleTimer)
		idleTimer = window.setTimeout(finish, SWIPE_WHEEL_IDLE_MS)
	}

	viewport.addEventListener('wheel', onWheel, { passive: false })
	return () => {
		viewport.removeEventListener('wheel', onWheel)
		clearTimer(idleTimer)
		clearTimer(settleTimer)
		cleanupVisuals()
	}
}
