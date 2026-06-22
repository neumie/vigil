import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react'
import { type AppConfig, type CreateItemInput, type DashboardItem, type PlanInfo, api } from '../api'

type Kind = CreateItemInput['kind']
type ProjectOption = NonNullable<AppConfig['projects']>[number]
type SpawnerOption = NonNullable<AppConfig['spawnerAdapters']>[number]
export type CreateItemIntent = 'queue' | 'plan'

interface ItemCreateClient {
	createItem: (input: CreateItemInput) => Promise<DashboardItem | DashboardItem[]>
	planItem: (id: string) => Promise<PlanInfo>
}

interface Props {
	projects: ProjectOption[]
	spawnerAdapters: SpawnerOption[]
	forkFrom?: DashboardItem | null
	onCreated: (created: DashboardItem | DashboardItem[]) => void | Promise<void>
	onCancel: () => void
}

export interface ItemCreateFormState {
	kind: Kind
	projectSlug: string
	title: string
	baseRef: string
	baseItemId?: string
	spawnerName: string
	parallelism: number
	prompt: string
	prdPath: string
	ralphMode: 'once' | 'afk'
	ralphProvider: '' | 'claude' | 'codex'
	model: string
	effort: string
	iterations: number
	noOversee: boolean
	target: string
	rounds: number
}

const fieldStyle = {
	width: '100%',
	padding: '9px 10px',
	background: 'var(--bg-1)',
	border: '1px solid var(--border)',
	borderRadius: 'var(--radius-sm)',
	color: 'var(--text-1)',
	fontFamily: 'var(--font-sans)',
	fontSize: 13,
	outline: 'none',
} satisfies CSSProperties

const labelStyle = {
	display: 'flex',
	flexDirection: 'column',
	gap: 6,
	color: 'var(--text-3)',
	fontSize: 11,
	fontWeight: 600,
	textTransform: 'uppercase',
	letterSpacing: '0.04em',
} satisfies CSSProperties

function optionalString(value: string): string | undefined {
	const trimmed = value.trim()
	return trimmed ? trimmed : undefined
}

function payloadLabel(kind: Kind): string {
	switch (kind) {
		case 'solve':
			return 'Prompt'
		case 'ralph':
			return 'PRD Path'
		case 'harden':
			return 'Target'
	}
}

export function buildCreateItemInput(state: ItemCreateFormState): CreateItemInput | null {
	const trimmedTitle = state.title.trim()
	if (!trimmedTitle || !state.projectSlug) return null

	const trimmedBaseItemId = optionalString(state.baseItemId ?? '')
	const trimmedBaseRef = optionalString(state.baseRef)
	const common = {
		title: trimmedTitle,
		projectSlug: state.projectSlug,
		...(trimmedBaseItemId ? { baseItemId: trimmedBaseItemId } : trimmedBaseRef ? { baseRef: trimmedBaseRef } : {}),
		...(state.spawnerName ? { spawner: state.spawnerName } : {}),
		...(state.parallelism > 1 ? { parallelism: state.parallelism } : {}),
	}

	switch (state.kind) {
		case 'solve': {
			const trimmedPrompt = state.prompt.trim()
			return trimmedPrompt ? { ...common, kind: state.kind, prompt: trimmedPrompt } : null
		}
		case 'ralph': {
			const trimmedPath = state.prdPath.trim()
			return trimmedPath
				? {
						...common,
						kind: state.kind,
						prdPath: trimmedPath,
						mode: state.ralphMode,
						...(state.ralphProvider ? { provider: state.ralphProvider } : {}),
						...(optionalString(state.model) ? { model: optionalString(state.model) } : {}),
						...(optionalString(state.effort) ? { effort: optionalString(state.effort) } : {}),
						...(state.ralphMode === 'afk' ? { iterations: state.iterations } : {}),
						...(state.noOversee ? { noOversee: state.noOversee } : {}),
					}
				: null
		}
		case 'harden': {
			const trimmedTarget = state.target.trim()
			return trimmedTarget
				? {
						...common,
						kind: state.kind,
						target: trimmedTarget,
						...(state.rounds > 1 ? { rounds: state.rounds } : {}),
					}
				: null
		}
	}
}

function createdItemsArray(created: DashboardItem | DashboardItem[]): DashboardItem[] {
	return Array.isArray(created) ? created : [created]
}

export async function createItemWithIntent(
	input: CreateItemInput,
	intent: CreateItemIntent,
	client: ItemCreateClient = api,
): Promise<DashboardItem | DashboardItem[]> {
	const createInput = intent === 'plan' ? { ...input, intent } : input
	const created = await client.createItem(createInput)
	if (intent === 'plan') {
		for (const item of createdItemsArray(created)) {
			await client.planItem(item.id)
		}
	}
	return created
}

export function ItemCreateForm({ projects, spawnerAdapters, forkFrom = null, onCreated, onCancel }: Props) {
	const forkContext = forkFrom?.forkContext ?? null
	const [kind, setKind] = useState<Kind>(forkFrom?.kind ?? 'solve')
	const [projectSlug, setProjectSlug] = useState('')
	const [title, setTitle] = useState('')
	const [baseRef, setBaseRef] = useState('')
	const [spawnerName, setSpawnerName] = useState('')
	const [parallelism, setParallelism] = useState(1)
	const [prompt, setPrompt] = useState('')
	const [prdPath, setPrdPath] = useState('')
	const [ralphMode, setRalphMode] = useState<'once' | 'afk'>('once')
	const [ralphProvider, setRalphProvider] = useState<'' | 'claude' | 'codex'>('')
	const [model, setModel] = useState('')
	const [effort, setEffort] = useState('')
	const [iterations, setIterations] = useState(10)
	const [noOversee, setNoOversee] = useState(false)
	const [target, setTarget] = useState('')
	const [rounds, setRounds] = useState(1)
	const [submitting, setSubmitting] = useState<CreateItemIntent | null>(null)
	const [error, setError] = useState<string | null>(null)

	const selectedProject = useMemo(
		() => projects.find(project => project.slug === projectSlug) ?? projects[0],
		[projects, projectSlug],
	)
	const availableSpawners = spawnerAdapters.filter(adapter => adapter.available)

	useEffect(() => {
		if (forkFrom && forkContext) {
			setKind(forkFrom.kind)
			setProjectSlug(forkFrom.projectSlug)
			setBaseRef(forkContext.branchName)
			return
		}
		if (!selectedProject) return
		if (!projectSlug) setProjectSlug(selectedProject.slug)
		if (!baseRef) setBaseRef(selectedProject.baseBranch ?? 'main')
	}, [baseRef, forkContext, forkFrom, projectSlug, selectedProject])

	const chooseProject = (slug: string) => {
		const nextProject = projects.find(project => project.slug === slug)
		setProjectSlug(slug)
		setBaseRef(nextProject?.baseBranch ?? '')
	}

	const buildInput = (): CreateItemInput | null => {
		return buildCreateItemInput({
			kind,
			projectSlug,
			title,
			baseRef,
			baseItemId: forkContext?.itemId,
			spawnerName,
			parallelism,
			prompt,
			prdPath,
			ralphMode,
			ralphProvider,
			model,
			effort,
			iterations,
			noOversee,
			target,
			rounds,
		})
	}

	const submit = async (event: FormEvent, intent: CreateItemIntent = 'queue') => {
		event.preventDefault()
		await submitWithIntent(intent)
	}

	const submitWithIntent = async (intent: CreateItemIntent) => {
		const input = buildInput()
		if (!input) {
			setError(`${payloadLabel(kind)} and title are required.`)
			return
		}
		setSubmitting(intent)
		setError(null)
		try {
			const created = await createItemWithIntent(input, intent)
			await onCreated(created)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Item creation failed')
		} finally {
			setSubmitting(null)
		}
	}

	return (
		<form onSubmit={submit} style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 20 }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
				<div>
					<h2 style={{ color: 'var(--text-0)', fontSize: 20, fontWeight: 700 }}>New Item</h2>
					<p style={{ color: 'var(--text-4)', fontSize: 12 }}>{kind}</p>
				</div>
				<div style={{ display: 'flex', gap: 8 }}>
					{(['solve', 'ralph', 'harden'] as const).map(option => (
						<button
							key={option}
							type="button"
							onClick={() => setKind(option)}
							style={{
								padding: '7px 12px',
								background: kind === option ? 'var(--accent-dim)' : 'var(--bg-1)',
								border: `1px solid ${kind === option ? 'var(--accent)' : 'var(--border)'}`,
								borderRadius: 'var(--radius-sm)',
								color: kind === option ? 'var(--accent)' : 'var(--text-2)',
								fontFamily: 'var(--font-sans)',
								fontSize: 12,
								fontWeight: 600,
								textTransform: 'capitalize',
								cursor: 'pointer',
							}}
						>
							{option}
						</button>
					))}
				</div>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
				<label style={labelStyle}>
					Project
					<select
						value={projectSlug}
						onChange={event => chooseProject(event.target.value)}
						style={fieldStyle}
						disabled={projects.length === 0 || Boolean(forkContext)}
					>
						{projects.length === 0 ? (
							<option value="">No projects</option>
						) : (
							projects.map(project => (
								<option key={project.slug} value={project.slug}>
									{project.slug}
								</option>
							))
						)}
					</select>
				</label>
				<label style={labelStyle}>
					Title
					<input value={title} onChange={event => setTitle(event.target.value)} style={fieldStyle} />
				</label>
				{forkContext ? (
					<label style={labelStyle}>
						Fork From
						<input value={forkContext.branchName} readOnly style={{ ...fieldStyle, color: 'var(--text-2)' }} />
					</label>
				) : (
					<label style={labelStyle}>
						BaseRef
						<input value={baseRef} onChange={event => setBaseRef(event.target.value)} style={fieldStyle} />
					</label>
				)}
				{availableSpawners.length > 0 && (
					<label style={labelStyle}>
						Spawner
						<select value={spawnerName} onChange={event => setSpawnerName(event.target.value)} style={fieldStyle}>
							<option value="">config default</option>
							{availableSpawners.map(adapter => (
								<option key={adapter.name} value={adapter.name}>
									{adapter.name}
								</option>
							))}
						</select>
					</label>
				)}
				<label style={labelStyle}>
					Parallelism
					<input
						type="number"
						min={1}
						value={parallelism}
						onChange={event => setParallelism(Math.max(1, Number(event.target.value) || 1))}
						style={fieldStyle}
					/>
				</label>
			</div>

			{kind === 'solve' && (
				<label style={labelStyle}>
					Prompt
					<textarea
						value={prompt}
						onChange={event => setPrompt(event.target.value)}
						rows={9}
						style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
					/>
				</label>
			)}

			{kind === 'ralph' && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
					<label style={labelStyle}>
						PRD Path
						<input value={prdPath} onChange={event => setPrdPath(event.target.value)} style={fieldStyle} />
					</label>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
						<label style={labelStyle}>
							Mode
							<select
								value={ralphMode}
								onChange={event => setRalphMode(event.target.value as 'once' | 'afk')}
								style={fieldStyle}
							>
								<option value="once">once</option>
								<option value="afk">afk</option>
							</select>
						</label>
						<label style={labelStyle}>
							Agent
							<select
								value={ralphProvider}
								onChange={event => setRalphProvider(event.target.value as '' | 'claude' | 'codex')}
								style={fieldStyle}
							>
								<option value="">default</option>
								<option value="claude">claude</option>
								<option value="codex">codex</option>
							</select>
						</label>
						<label style={labelStyle}>
							Model
							<input value={model} onChange={event => setModel(event.target.value)} style={fieldStyle} />
						</label>
						<label style={labelStyle}>
							Effort
							<input value={effort} onChange={event => setEffort(event.target.value)} style={fieldStyle} />
						</label>
						<label style={labelStyle}>
							Iterations
							<input
								type="number"
								min={1}
								value={iterations}
								disabled={ralphMode !== 'afk'}
								onChange={event => setIterations(Math.max(1, Number(event.target.value) || 1))}
								style={fieldStyle}
							/>
						</label>
						<label
							style={{
								...labelStyle,
								flexDirection: 'row',
								alignItems: 'center',
								alignSelf: 'end',
								minHeight: 38,
								textTransform: 'none',
								letterSpacing: 0,
								color: 'var(--text-2)',
							}}
						>
							<input
								type="checkbox"
								checked={noOversee}
								onChange={event => setNoOversee(event.target.checked)}
								style={{ accentColor: 'var(--accent)' }}
							/>
							No oversee
						</label>
					</div>
				</div>
			)}

			{kind === 'harden' && (
				<div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', gap: 14 }}>
					<label style={labelStyle}>
						Target
						<input value={target} onChange={event => setTarget(event.target.value)} style={fieldStyle} />
					</label>
					<label style={labelStyle}>
						Rounds
						<input
							type="number"
							min={1}
							value={rounds}
							onChange={event => setRounds(Math.max(1, Number(event.target.value) || 1))}
							style={fieldStyle}
						/>
					</label>
				</div>
			)}

			{error && (
				<div
					style={{
						color: 'var(--red)',
						background: 'var(--red-dim)',
						border: '1px solid rgba(242, 88, 91, 0.35)',
						borderRadius: 'var(--radius-sm)',
						padding: '9px 10px',
						fontSize: 12,
					}}
				>
					{error}
				</div>
			)}

			<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
				<button
					type="button"
					onClick={onCancel}
					disabled={submitting !== null}
					style={{
						padding: '9px 14px',
						background: 'var(--bg-1)',
						border: '1px solid var(--border)',
						borderRadius: 'var(--radius-sm)',
						color: 'var(--text-2)',
						fontFamily: 'var(--font-sans)',
						cursor: 'pointer',
					}}
				>
					Cancel
				</button>
				<button
					type="button"
					disabled={submitting !== null || projects.length === 0}
					onClick={() => submitWithIntent('plan')}
					style={{
						padding: '9px 14px',
						background: 'var(--bg-1)',
						border: '1px solid var(--border)',
						borderRadius: 'var(--radius-sm)',
						color: 'var(--text-2)',
						fontFamily: 'var(--font-sans)',
						fontWeight: 600,
						cursor: submitting !== null || projects.length === 0 ? 'default' : 'pointer',
						opacity: submitting !== null || projects.length === 0 ? 0.6 : 1,
					}}
				>
					{submitting === 'plan' ? 'Planning...' : `Plan ${kind}`}
				</button>
				<button
					type="submit"
					disabled={submitting !== null || projects.length === 0}
					style={{
						padding: '9px 14px',
						background: submitting !== null || projects.length === 0 ? 'var(--bg-3)' : 'var(--accent-fill)',
						border: '1px solid transparent',
						borderRadius: 'var(--radius-sm)',
						color: 'white',
						fontFamily: 'var(--font-sans)',
						fontWeight: 600,
						cursor: submitting !== null || projects.length === 0 ? 'default' : 'pointer',
					}}
				>
					{submitting === 'queue' ? 'Queueing...' : `Queue ${kind}`}
				</button>
			</div>
		</form>
	)
}
