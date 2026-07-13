// Two-finger swipe-back for the push stack (docs/design-system.md §3.10
// gestures): macOS trackpads deliver horizontal pan as wheel events with
// deltaX. SwipeTracker is the pure gesture state machine (unit-tested from
// tests/helm-swipe.test.ts); attachSwipeBack is the DOM controller that drives
// the page transforms and owns gesture-boundary timing.
//
// Sign convention: with macOS natural scrolling, fingers moving RIGHT (the
// Safari back gesture) produce NEGATIVE wheel deltaX ("scroll toward the left
// edge of the content"). Back progress therefore accumulates -deltaX.
//
// WheelEvent carries no gesture-phase info in Chromium: fingers-down motion,
// the lift, and the momentum tail (same-sign deltas decaying roughly
// exponentially over ~300-800ms) arrive as one undifferentiated delta stream.
// Everything below is calibrated around that blindness:
//   - engagement is a DEAD ZONE (accumulated travel + dominance), not a
//     first-event bet — no visual movement until intent is clear;
//   - commits fire EAGERLY the moment a threshold is crossed mid-stream, so a
//     pop never waits out a momentum tail;
//   - after any engaged gesture settles, a REFRACTORY quiescence gap swallows
//     every wheel event and restarts itself, so the rest of the physical
//     gesture (tail or still-moving fingers) can never pop a second page.

// --- tuning constants (documented in design-system.md §3.10) --------------------

/** Dead zone: tracking engages only after this much accumulated back travel
 *  since gesture start. Below it the page must not move at all — filters the
 *  diagonal jitter the old first-event bet let through. */
export const SWIPE_ENGAGE_PX = 30
/** …and horizontal must dominate: |ΣdeltaX| > this ×|ΣdeltaY| at the engage
 *  decision, or the gesture is rejected for its whole lifetime. */
export const SWIPE_ENGAGE_DOMINANCE = 2
/** Commit the pop once the page is dragged past this fraction of pane width. */
export const SWIPE_COMMIT_FRACTION = 0.5
/** …or on a genuine flick: back-velocity over the trailing window above this
 *  (px/ms). Ordinary two-finger scrolling runs ~0.3-1 px/ms; a deliberate
 *  flick lands 2-4. The old 0.7 fired on ordinary scroll speed. */
export const SWIPE_FLICK_VELOCITY = 1.5
/** Flick velocity is averaged over this trailing window, anchored at the
 *  newest event — recent motion only, so an early burst in a long drag or a
 *  decayed momentum tail can't smuggle a commit through. */
export const SWIPE_FLICK_WINDOW_MS = 80
/** A flick also needs this fraction of pane width in real travel — a violent
 *  two-event twitch never commits. */
export const SWIPE_MIN_FLICK_FRACTION = 0.2
/** No wheel events for this long = the gesture ended. Long enough to bridge
 *  fingers resting mid-drag and intra-tail hiccups; post-release latency is
 *  dominated by the momentum tail (which keeps events flowing), not this. */
export const SWIPE_WHEEL_IDLE_MS = 140
/** Refractory quiescence gap after any engaged gesture settles (commit OR
 *  spring-back). Every wheel event restarts it, so it outlasts any momentum
 *  tail; only a real pause re-arms gestures. */
export const SWIPE_COOLDOWN_MS = 280
/** Commit settle: the remaining travel animates at constant-ish perceived
 *  speed — duration scales with remaining distance, full width taking this. */
export const SWIPE_COMMIT_MAX_MS = 200
/** …floored so the last few px never blink. */
export const SWIPE_COMMIT_MIN_MS = 80
/** Spring back to rest when the gesture ends below both commit bars. */
export const SWIPE_SPRING_BACK_MS = 180

// --- pure gesture core -----------------------------------------------------------

export type SwipeFeedResult = 'ignored' | 'pending' | 'started' | 'tracking'

type Sample = { t: number; cum: number }

/**
 * Accumulates one wheel-gesture's horizontal deltas into back-swipe progress.
 * A gesture starts UNDECIDED ('pending'): deltas accumulate invisibly until
 * either clear back intent emerges (≥ SWIPE_ENGAGE_PX of back travel that
 * dominates vertical by SWIPE_ENGAGE_DOMINANCE, with a consumer-free start)
 * → engaged, or the accumulation first crosses the threshold any other way
 * (vertical, diagonal, forward pan, consumed) → rejected for its lifetime.
 */
export class SwipeTracker {
	private readonly width: number
	private sumX = 0
	private sumY = 0
	private progress = 0
	private cum = 0
	private state: 'pending' | 'rejected' | 'engaged' = 'pending'
	private samples: Sample[] = []

	constructor(paneWidth: number) {
		this.width = Math.max(1, paneWidth)
	}

	feed(deltaX: number, deltaY: number, timeMs: number, canStart: () => boolean): SwipeFeedResult {
		if (this.state === 'rejected') return 'ignored'
		this.cum += -deltaX
		this.samples.push({ t: timeMs, cum: this.cum })
		this.pruneSamples(timeMs)
		if (this.state === 'pending') {
			this.sumX += deltaX
			this.sumY += deltaY
			if (Math.max(Math.abs(this.sumX), Math.abs(this.sumY)) < SWIPE_ENGAGE_PX) return 'pending'
			const back = -this.sumX
			const engages =
				back >= SWIPE_ENGAGE_PX && Math.abs(this.sumX) > SWIPE_ENGAGE_DOMINANCE * Math.abs(this.sumY) && canStart()
			if (!engages) {
				this.state = 'rejected'
				this.samples = []
				return 'ignored'
			}
			this.state = 'engaged'
			// Track from the engage point: the dead zone is subtracted so the
			// page starts moving from 0 instead of jumping SWIPE_ENGAGE_PX in.
			this.progress = Math.min(this.width, back - SWIPE_ENGAGE_PX)
			return 'started'
		}
		this.progress = Math.min(this.width, Math.max(0, this.progress - deltaX))
		return 'tracking'
	}

	/** Keep exactly one sample at/beyond the window edge as the velocity anchor. */
	private pruneSamples(nowMs: number): void {
		while (this.samples.length > 1) {
			const next = this.samples[1]
			if (!next || nowMs - next.t < SWIPE_FLICK_WINDOW_MS) break
			this.samples.shift()
		}
	}

	/** Back-velocity (px/ms) averaged over the trailing SWIPE_FLICK_WINDOW_MS,
	 *  anchored at the newest event. A single event has no measurable rate → 0. */
	recentVelocity(): number {
		const last = this.samples[this.samples.length - 1]
		const anchor = this.samples[0]
		if (!last || !anchor || last === anchor) return 0
		const span = last.t - anchor.t
		if (span <= 0) return 0
		return (last.cum - anchor.cum) / span
	}

	/** True while this gesture is interactively dragging the page. */
	get tracking(): boolean {
		return this.state === 'engaged'
	}

	get progressPx(): number {
		return this.progress
	}

	/** 0..1 of pane width. */
	get fraction(): number {
		return this.progress / this.width
	}

	/** Commit decision — evaluated EAGERLY after every fed event, not at
	 *  gesture end (a spent momentum tail decays recentVelocity to ~0, so an
	 *  end-of-gesture flick check could never fire). */
	shouldCommit(): boolean {
		if (this.state !== 'engaged') return false
		if (this.fraction >= SWIPE_COMMIT_FRACTION) return true
		return this.recentVelocity() >= SWIPE_FLICK_VELOCITY && this.fraction >= SWIPE_MIN_FLICK_FRACTION
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

export interface SwipeBackControl {
	dispose(): void
	/** Single-owner check for the native three-finger-swipe / Go-channel BACK
	 *  handler ("two or three fingers" system setting can deliver ONE physical
	 *  gesture both as wheel deltas and as a native 'swipe' event). Returns
	 *  true when the wheel path already owns the gesture (engaged tracking,
	 *  settle animation, or refractory) — the caller must swallow the native
	 *  event or one gesture pops twice. Otherwise returns false (caller pops)
	 *  and arms the refractory gap so the same gesture's wheel deltas can't
	 *  ALSO trigger a pop after the native one. */
	interceptNativeNav(): boolean
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
 * inline transforms (no easing); crossing a commit threshold immediately
 * animates the pop, a sub-threshold gesture end springs back. Returns a
 * control with a disposer and the native-nav single-owner check.
 */
export function attachSwipeBack(viewport: HTMLElement, handlers: SwipeBackHandlers): SwipeBackControl {
	let tracker: SwipeTracker | null = null
	let pages: { top: HTMLElement; under: HTMLElement } | null = null
	let scrim: HTMLDivElement | null = null
	let idleTimer: number | null = null
	let settleTimer: number | null = null
	/** 'animating' = commit/spring-back in flight; 'cooldown' = refractory gap. */
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

	const setTransitions = (ms: number) => {
		if (!pages) return
		pages.top.style.transition = `transform ${ms}ms ease-out`
		pages.under.style.transition = `transform ${ms}ms ease-out`
		if (scrim) scrim.style.transition = `opacity ${ms}ms ease-out`
	}

	/** Eager commit: fires mid-gesture the moment a threshold is crossed. The
	 *  rest of the physical gesture lands in 'animating' then the refractory
	 *  gap — swallowed either way. */
	const commit = (done: SwipeTracker) => {
		clearTimer(idleTimer)
		idleTimer = null
		tracker = null
		if (handlers.reducedMotion() || !pages) {
			cleanupVisuals()
			handlers.commitPop()
			enterCooldown()
			return
		}
		phase = 'animating'
		const width = Math.max(1, viewport.clientWidth)
		const remaining = Math.max(0, width - done.progressPx)
		// Constant-ish perceived speed: remaining distance sets the duration.
		const ms = Math.round(
			Math.min(SWIPE_COMMIT_MAX_MS, Math.max(SWIPE_COMMIT_MIN_MS, (remaining / width) * SWIPE_COMMIT_MAX_MS)),
		)
		setTransitions(ms)
		// Next frame so the transition sees a start value.
		requestAnimationFrame(() => render(1, width))
		clearTimer(settleTimer)
		settleTimer = window.setTimeout(() => {
			cleanupVisuals()
			handlers.commitPop()
			enterCooldown()
		}, ms + 30)
	}

	/** Gesture ended (SWIPE_WHEEL_IDLE_MS of wheel silence) without committing. */
	const finish = () => {
		idleTimer = null
		const done = tracker
		tracker = null
		if (!done?.tracking || !pages) {
			// Never engaged (vertical scroll, dead-zone fizzle, consumed pan):
			// no refractory — the next distinct gesture may navigate immediately.
			cleanupVisuals()
			phase = 'idle'
			return
		}
		if (handlers.reducedMotion()) {
			cleanupVisuals()
			enterCooldown()
			return
		}
		phase = 'animating'
		setTransitions(SWIPE_SPRING_BACK_MS)
		requestAnimationFrame(() => render(0, 0))
		clearTimer(settleTimer)
		settleTimer = window.setTimeout(() => {
			cleanupVisuals()
			enterCooldown()
		}, SWIPE_SPRING_BACK_MS + 30)
	}

	const onWheel = (event: WheelEvent) => {
		// Settle animation owns the screen; whatever lands here is the same
		// physical gesture's leftovers, and the refractory gap follows the
		// animation unconditionally — swallowed either way.
		if (phase === 'animating') return
		if (phase === 'cooldown') {
			// Refractory: any wheel activity (momentum tail, still-moving
			// fingers) restarts the quiescence gap; only a real pause re-arms.
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
			if (pages) {
				if (!handlers.reducedMotion()) {
					beginVisuals()
					render(tracker.fraction, tracker.progressPx)
				}
				event.preventDefault()
			}
		} else if (result === 'tracking' && pages) {
			if (!handlers.reducedMotion()) render(tracker.fraction, tracker.progressPx)
			event.preventDefault()
		}
		if (pages && tracker.shouldCommit()) {
			commit(tracker)
			return
		}
		clearTimer(idleTimer)
		idleTimer = window.setTimeout(finish, SWIPE_WHEEL_IDLE_MS)
	}

	const interceptNativeNav = (): boolean => {
		if (phase === 'animating') return true
		if (phase === 'cooldown') {
			enterCooldown()
			return true
		}
		if (phase === 'gesturing' && tracker?.tracking) return true
		// Wheel path not engaged: the native pop proceeds; kill any undecided
		// tracker and enter the refractory gap so this same physical gesture's
		// wheel deltas can't ALSO engage and pop after the native one.
		clearTimer(idleTimer)
		idleTimer = null
		tracker = null
		cleanupVisuals()
		enterCooldown()
		return false
	}

	viewport.addEventListener('wheel', onWheel, { passive: false })
	return {
		dispose: () => {
			viewport.removeEventListener('wheel', onWheel)
			clearTimer(idleTimer)
			clearTimer(settleTimer)
			cleanupVisuals()
		},
		interceptNativeNav,
	}
}
