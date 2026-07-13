// SwipeTracker + attachSwipeBack — the gesture machinery behind helm's
// two-finger swipe-back (app/src/renderer/sidebar/swipe.ts; spec in
// docs/design-system.md §3.10). app/package.json has no `type: module`, so
// tsx loads the module as CJS — default-import + destructure, same pattern
// as the other helm tests.

import assert from 'node:assert/strict'
import test from 'node:test'
import swipeModule from '../app/src/renderer/sidebar/swipe.ts'

type SwipeModule = typeof import('../app/src/renderer/sidebar/swipe.ts')
const {
	SwipeTracker,
	attachSwipeBack,
	SWIPE_ENGAGE_PX,
	SWIPE_ENGAGE_DOMINANCE,
	SWIPE_COMMIT_FRACTION,
	SWIPE_FLICK_VELOCITY,
	SWIPE_MIN_FLICK_FRACTION,
	SWIPE_COOLDOWN_MS,
} = swipeModule as SwipeModule

const WIDTH = 340
const yes = () => true
const no = () => false

// --- pure tracker: engagement ------------------------------------------------------

test('dead zone: no engagement or movement below the accumulated travel threshold', () => {
	const tracker = new SwipeTracker(WIDTH)
	assert.equal(tracker.feed(-10, 1, 0, yes), 'pending')
	assert.equal(tracker.feed(-10, 1, 16, yes), 'pending')
	assert.equal(tracker.progressPx, 0)
	assert.equal(tracker.tracking, false)
	assert.equal(tracker.shouldCommit(), false)
})

test('clear horizontal intent engages; progress tracks from the engage point', () => {
	const tracker = new SwipeTracker(WIDTH)
	assert.equal(tracker.feed(-20, 2, 0, yes), 'pending')
	assert.equal(tracker.feed(-30, 2, 16, yes), 'started')
	// 50px of back travel minus the dead zone — no jump at engagement.
	assert.equal(tracker.progressPx, 50 - SWIPE_ENGAGE_PX)
	assert.ok(tracker.tracking)
	assert.equal(tracker.feed(-30, 0, 32, yes), 'tracking')
	assert.equal(tracker.progressPx, 80 - SWIPE_ENGAGE_PX)
})

test('diagonal motion without 2x horizontal dominance rejects the gesture for good', () => {
	const tracker = new SwipeTracker(WIDTH)
	assert.equal(tracker.feed(-20, 12, 0, yes), 'pending')
	// sumX -35 crosses the travel bar but 35 <= 2 x 20 — not dominant.
	assert.ok(35 <= SWIPE_ENGAGE_DOMINANCE * 20)
	assert.equal(tracker.feed(-15, 8, 16, yes), 'ignored')
	// later clean horizontal motion in the same gesture stays ignored
	assert.equal(tracker.feed(-60, 0, 32, yes), 'ignored')
	assert.equal(tracker.tracking, false)
})

test('vertical-dominant gesture rejects and stays rejected', () => {
	const tracker = new SwipeTracker(WIDTH)
	assert.equal(tracker.feed(-5, 40, 0, yes), 'ignored')
	assert.equal(tracker.feed(-60, 0, 16, yes), 'ignored')
	assert.equal(tracker.tracking, false)
	assert.equal(tracker.shouldCommit(), false)
})

test('forward-content pan (positive deltaX) rejects the gesture', () => {
	const tracker = new SwipeTracker(WIDTH)
	assert.equal(tracker.feed(40, 0, 0, yes), 'ignored')
	assert.equal(tracker.feed(-40, 0, 16, yes), 'ignored')
})

test('a consumer at engagement (scrollable ancestor / nothing to pop) rejects', () => {
	const tracker = new SwipeTracker(WIDTH)
	assert.equal(tracker.feed(-40, 0, 0, no), 'ignored')
	// the gesture cannot re-qualify mid-flight even if the consumer freed up
	assert.equal(tracker.feed(-40, 0, 16, yes), 'ignored')
})

// --- pure tracker: commit decision --------------------------------------------------

test('drag past half the pane width commits', () => {
	const tracker = new SwipeTracker(WIDTH)
	tracker.feed(-40, 0, 0, yes)
	assert.equal(tracker.shouldCommit(), false)
	for (let i = 1; i <= 5; i++) tracker.feed(-40, 0, i * 16, yes)
	// 240px travel - 30px dead zone = 210 >= 170 (half of 340)
	assert.ok(tracker.fraction >= SWIPE_COMMIT_FRACTION)
	assert.ok(tracker.shouldCommit())
})

test('ordinary scroll speed below half width never commits (velocity bar)', () => {
	const tracker = new SwipeTracker(WIDTH)
	// ~0.94 px/ms — brisk normal scrolling. Under the old 0.7 px/ms bar with a
	// 40px travel floor this committed: the hair trigger this rewrite removes.
	for (let i = 0; i <= 9; i++) {
		tracker.feed(-15, 0, i * 16, yes)
		assert.equal(tracker.shouldCommit(), false)
	}
	assert.ok(tracker.fraction < SWIPE_COMMIT_FRACTION)
	assert.ok(tracker.progressPx >= SWIPE_MIN_FLICK_FRACTION * WIDTH)
	assert.ok(tracker.recentVelocity() < SWIPE_FLICK_VELOCITY)
})

test('a genuine flick commits below half width', () => {
	const tracker = new SwipeTracker(WIDTH)
	// ~2.5 px/ms over the trailing window, 130px tracked travel (< 170px half)
	for (let i = 0; i <= 3; i++) tracker.feed(-40, 0, i * 16, yes)
	assert.ok(tracker.fraction < SWIPE_COMMIT_FRACTION)
	assert.ok(tracker.progressPx >= SWIPE_MIN_FLICK_FRACTION * WIDTH)
	assert.ok(tracker.recentVelocity() >= SWIPE_FLICK_VELOCITY)
	assert.ok(tracker.shouldCommit())
})

test('a violent two-event twitch never commits (min flick travel)', () => {
	const tracker = new SwipeTracker(WIDTH)
	tracker.feed(-40, 0, 0, yes)
	tracker.feed(-20, 0, 8, yes) // huge velocity, 30px of tracked travel
	assert.ok(tracker.recentVelocity() >= SWIPE_FLICK_VELOCITY)
	assert.ok(tracker.progressPx < SWIPE_MIN_FLICK_FRACTION * WIDTH)
	assert.equal(tracker.shouldCommit(), false)
})

test('a decaying momentum tail cannot flick-commit (velocity is recent-window only)', () => {
	const tracker = new SwipeTracker(WIDTH)
	// Fast start engages and travels, but stays below every commit bar…
	tracker.feed(-50, 0, 0, yes)
	assert.equal(tracker.shouldCommit(), false)
	tracker.feed(-30, 0, 16, yes)
	assert.equal(tracker.shouldCommit(), false)
	// …then a macOS-style momentum tail: same-sign deltas decaying roughly
	// exponentially. Total travel passes the min-flick floor, but the trailing
	// 80ms window sees only the decayed rate — no commit at ANY point.
	let delta = -16
	let time = 32
	while (Math.abs(delta) >= 1) {
		tracker.feed(delta, 0, time, yes)
		assert.equal(tracker.shouldCommit(), false)
		delta *= 0.7
		time += 16
	}
	assert.ok(tracker.progressPx >= SWIPE_MIN_FLICK_FRACTION * WIDTH)
	assert.ok(tracker.fraction < SWIPE_COMMIT_FRACTION)
})

test('progress clamps to the pane width and to zero', () => {
	const tracker = new SwipeTracker(WIDTH)
	tracker.feed(-300, 0, 0, yes)
	tracker.feed(-300, 0, 16, yes)
	assert.equal(tracker.progressPx, WIDTH)
	assert.equal(tracker.fraction, 1)
	// dragging back past the origin clamps at 0
	tracker.feed(900, 0, 32, yes)
	assert.equal(tracker.progressPx, 0)
})

// --- DOM controller: refractory gap + native single-owner --------------------------
// attachSwipeBack needs window timers and an Element global for the
// scroll-consumer walk; reduced-motion mode keeps it off document/rAF.

const g = globalThis as Record<string, unknown>
g.window ??= { setTimeout, clearTimeout }
g.Element ??= class {}

function fakePage(): HTMLElement {
	return {
		classList: { add() {}, remove() {} },
		style: {},
		appendChild() {},
	} as unknown as HTMLElement
}

function harness(width = WIDTH) {
	const listeners = new Map<string, (event: unknown) => void>()
	let pops = 0
	const viewport = {
		clientWidth: width,
		addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
		removeEventListener: (type: string) => listeners.delete(type),
	} as unknown as HTMLElement
	const control = attachSwipeBack(viewport, {
		canPop: () => true,
		getPages: () => ({ top: fakePage(), under: fakePage() }),
		commitPop: () => {
			pops += 1
		},
		reducedMotion: () => true,
	})
	const wheel = (deltaX: number, deltaY: number, timeStamp: number) =>
		listeners.get('wheel')?.({ deltaX, deltaY, timeStamp, target: null, preventDefault: () => {} })
	return { wheel, control, pops: () => pops }
}

test('momentum tail after a commit pops exactly ONE page', () => {
	const h = harness()
	// Fingers: strong back swipe — crosses a commit bar mid-gesture (the flick
	// bar first: ~2.5 px/ms with > 20% width traveled).
	let time = 0
	for (let i = 0; i < 6; i++) {
		h.wheel(-40, 0, time)
		time += 16
	}
	assert.equal(h.pops(), 1)
	// Fingers lift; macOS momentum tail: same-sign deltas decaying roughly
	// exponentially over ~300ms. Every one must land in the refractory gap.
	let delta = -32
	while (Math.abs(delta) >= 1) {
		h.wheel(delta, 0, time)
		time += 16
		delta *= 0.85
	}
	assert.equal(h.pops(), 1)
	h.control.dispose()
})

test('a fresh swipe after the quiescence gap can pop again', async () => {
	const h = harness()
	let time = 0
	for (let i = 0; i < 6; i++) {
		h.wheel(-40, 0, time)
		time += 16
	}
	assert.equal(h.pops(), 1)
	h.wheel(-8, 0, time) // tail crumb keeps the gap alive
	await new Promise(resolve => setTimeout(resolve, SWIPE_COOLDOWN_MS + 60))
	time += 1000
	for (let i = 0; i < 6; i++) {
		h.wheel(-40, 0, time)
		time += 16
	}
	assert.equal(h.pops(), 2)
	h.control.dispose()
})

test('native swipe arriving after a wheel commit is swallowed (no double pop)', () => {
	const h = harness()
	let time = 0
	for (let i = 0; i < 6; i++) {
		h.wheel(-40, 0, time)
		time += 16
	}
	assert.equal(h.pops(), 1)
	// Same physical gesture also recognized by macOS as a page swipe.
	assert.equal(h.control.interceptNativeNav(), true)
	assert.equal(h.pops(), 1)
	h.control.dispose()
})

test('native swipe during engaged wheel tracking is owned by the wheel path', () => {
	const h = harness()
	h.wheel(-40, 0, 0) // engaged (past the dead zone), below every commit bar
	assert.equal(h.control.interceptNativeNav(), true)
	assert.equal(h.pops(), 0)
	h.control.dispose()
})

test('native swipe with no wheel engagement proceeds and arms the refractory gap', () => {
	const h = harness()
	assert.equal(h.control.interceptNativeNav(), false) // caller pops natively
	// The same gesture's wheel deltas must not ALSO pop.
	let time = 0
	for (let i = 0; i < 8; i++) {
		h.wheel(-40, 0, time)
		time += 16
	}
	assert.equal(h.pops(), 0)
	h.control.dispose()
})
