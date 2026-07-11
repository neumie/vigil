// Native sidebar root — push-stack navigation (design-system.md §3.10) over
// the VigilBridge snapshot. Data arrives exclusively through the main-process
// bridge (window.helm.vigil) — never fetch :7474 from this file:// renderer.
//
// Navigation model: list → detail → plan/task, list → archive, list →
// settings → section. Every stacked page stays mounted (scroll + state
// preserved); non-top pages are inert. Esc pops the stack when focus is in
// the pane (menus/sheets handle their own Esc in the capture phase first).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './sidebar.css'
import type { VigilSnapshot } from '../../shared-vigil'
import { showToast } from '../toast'
import { DetailPage, PlanPage, TaskPage } from './DetailPage'
import { ListPage } from './ListPage'
import { NewItemSheet } from './NewItemSheet'
import { SettingsPage, SettingsSectionPage, useSettingsStore } from './SettingsPage'
import type { Route } from './model'
import { PushHeader } from './ui'

const PUSH_MS = 150
const POP_MS = 120

function useVigilSnapshot(): VigilSnapshot | null {
	const [snapshot, setSnapshot] = useState<VigilSnapshot | null>(null)
	useEffect(() => {
		let alive = true
		const unsubscribe = window.helm.vigil.onSnapshot(next => {
			if (alive) setSnapshot(next)
		})
		// Initial state; pushes only arrive when polled state changes afterwards.
		void window.helm.vigil.subscribe().then(initial => {
			if (alive) setSnapshot(current => current ?? initial)
		})
		return () => {
			alive = false
			unsubscribe()
		}
	}, [])
	return snapshot
}

interface NavState {
	stack: Route[]
	/** Page animating out during a pop; rendered on top until the timer clears it. */
	leaving: Route | null
	phase: 'push' | 'pop' | null
}

function useNavStack() {
	const [nav, setNav] = useState<NavState>({ stack: [{ kind: 'list' }], leaving: null, phase: null })
	const timer = useRef<number | null>(null)

	const settle = useCallback((ms: number) => {
		if (timer.current !== null) clearTimeout(timer.current)
		timer.current = window.setTimeout(() => {
			setNav(prev => ({ ...prev, leaving: null, phase: null }))
			timer.current = null
		}, ms + 30)
	}, [])

	const push = useCallback(
		(route: Route) => {
			setNav(prev => ({ stack: [...prev.stack, route], leaving: null, phase: 'push' }))
			settle(PUSH_MS)
		},
		[settle],
	)

	const pop = useCallback(() => {
		setNav(prev => {
			if (prev.stack.length <= 1) return prev
			const top = prev.stack[prev.stack.length - 1] ?? null
			return { stack: prev.stack.slice(0, -1), leaving: top, phase: 'pop' }
		})
		settle(POP_MS)
	}, [settle])

	/** Replace the whole stack (vigil:// deep links) instead of piling pushes. */
	const reset = useCallback(
		(stack: Route[]) => {
			setNav({ stack, leaving: null, phase: 'push' })
			settle(PUSH_MS)
		},
		[settle],
	)

	useEffect(
		() => () => {
			if (timer.current !== null) clearTimeout(timer.current)
		},
		[],
	)

	return { nav, push, pop, reset }
}

export function SidebarRoot() {
	const snapshot = useVigilSnapshot()
	const { nav, push, pop, reset } = useNavStack()
	const [newItemOpen, setNewItemOpen] = useState(false)
	const [selectedId, setSelectedId] = useState<string | null>(null)

	const settingsActive = nav.stack.some(route => route.kind === 'settings' || route.kind === 'settings-section')
	const settings = useSettingsStore(settingsActive)

	const openItem = useCallback(
		(id: string) => {
			setSelectedId(id)
			push({ kind: 'detail', id })
		},
		[push],
	)

	// vigil://item/<id> (main's open-url → preload nav channel): jump straight
	// to the item, replacing whatever was stacked — a deep link is an absolute
	// destination, and repeated clicks must not pile up detail pages.
	useEffect(
		() =>
			window.helm.nav.onOpenItem(id => {
				setNewItemOpen(false)
				setSelectedId(id)
				reset([{ kind: 'list' }, { kind: 'detail', id }])
			}),
		[reset],
	)

	// Esc = back (§4) — only when the event came from inside the pane, never
	// from the terminal, and not from a typing context. Menus and the sheet
	// intercept Esc in the capture phase before this bubble listener runs.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || newItemOpen) return
			const target = event.target as HTMLElement | null
			if (!target || !target.closest('#left')) return
			if (target.matches('input, textarea, select')) return
			pop()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [pop, newItemOpen])

	// --ui-preview=<list|detail|settings>: auto-navigate once for the
	// screenshot harness (list is the default state, nothing to do).
	const previewDone = useRef(false)
	useEffect(() => {
		if (previewDone.current) return
		const preview = window.helm.uiPreview
		if (!preview || preview === 'list') {
			previewDone.current = true
			return
		}
		if (preview === 'settings') {
			previewDone.current = true
			push({ kind: 'settings' })
			return
		}
		// detail: needs an item id from the first snapshot with items.
		const items = snapshot?.items
		if (!items || items.length === 0) return
		previewDone.current = true
		const pick =
			items.find(i => i.status === 'review' || i.status === 'failed') ??
			items.find(i => i.assessment !== null) ??
			items[0]
		if (pick) openItem(pick.id)
	}, [snapshot, push, openItem])

	const runCommand = useCallback(async (label: string, call: () => Promise<{ error?: string }>) => {
		const result = await call()
		if (result.error !== undefined) showToast({ message: `${label} failed`, detail: result.error, ttlMs: 6000 })
		else showToast({ message: label })
	}, [])

	const renderRoute = (route: Route) => {
		switch (route.kind) {
			case 'list':
			case 'archive':
				return (
					<ListPage
						snapshot={snapshot}
						archive={route.kind === 'archive'}
						selectedId={selectedId}
						onOpenItem={openItem}
						onNewItem={() => setNewItemOpen(true)}
						onOpenArchive={() => push({ kind: 'archive' })}
						onOpenSettings={() => push({ kind: 'settings' })}
						onPoll={() => void runCommand('Poll requested', () => window.helm.vigil.poll())}
						onPauseToggle={() =>
							void runCommand(snapshot?.status?.queue.paused ? 'Queue resumed' : 'Queue paused', () =>
								window.helm.vigil.pauseToggle(),
							)
						}
					/>
				)
			case 'detail':
				return (
					<DetailPage
						id={route.id}
						snapshot={snapshot}
						onBack={pop}
						onOpenPlan={id => push({ kind: 'plan', id })}
						onOpenTask={id => push({ kind: 'task', id })}
					/>
				)
			case 'plan':
				return <PlanPage id={route.id} snapshot={snapshot} onBack={pop} />
			case 'task':
				return <TaskPage id={route.id} snapshot={snapshot} onBack={pop} />
			case 'settings':
				return (
					<SettingsPage
						store={settings}
						onBack={pop}
						onOpenSection={sectionId => push({ kind: 'settings-section', sectionId })}
					/>
				)
			case 'settings-section':
				return <SettingsSectionPage store={settings} sectionId={route.sectionId} onBack={pop} />
		}
	}

	// Archive is list-flavored but pushed — give it a header via wrapper below.
	const pages: Array<{ route: Route; key: string }> = nav.stack.map((route, index) => ({
		route,
		key: `${index}-${route.kind}-${'id' in route ? route.id : ''}${route.kind === 'settings-section' ? route.sectionId : ''}`,
	}))

	const topIndex = pages.length - 1

	return (
		<div className="sidebar">
			<div className="nav-viewport">
				{pages.map(({ route, key }, index) => {
					const isTop = index === topIndex && nav.leaving === null
					const classes = ['nav-page']
					if (nav.phase === 'push' && index === topIndex) classes.push('nav-push-in')
					if (nav.phase === 'push' && index === topIndex - 1) classes.push('nav-under-away')
					if (nav.phase === 'pop' && index === topIndex) classes.push('nav-under-back')
					return (
						<div
							key={key}
							className={classes.join(' ')}
							inert={!isTop || newItemOpen ? true : undefined}
							aria-hidden={!isTop}
						>
							{route.kind === 'archive' ? (
								<ArchiveFrame onBack={pop}>{renderRoute(route)}</ArchiveFrame>
							) : (
								renderRoute(route)
							)}
						</div>
					)
				})}
				{nav.leaving && (
					<div className="nav-page nav-pop-out" inert aria-hidden>
						{nav.leaving.kind === 'archive' ? (
							<ArchiveFrame onBack={pop}>{renderRoute(nav.leaving)}</ArchiveFrame>
						) : (
							renderRoute(nav.leaving)
						)}
					</div>
				)}
			</div>
			{newItemOpen && <NewItemSheet snapshot={snapshot} onClose={() => setNewItemOpen(false)} onCreated={openItem} />}
		</div>
	)
}

function ArchiveFrame({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
	return (
		<div className="archive-frame">
			<PushHeader title="Archive" onBack={onBack} />
			{children}
		</div>
	)
}

export function mountSidebar(container: HTMLElement): void {
	createRoot(container).render(<SidebarRoot />)
}
