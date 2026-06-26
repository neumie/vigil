import { useEffect, useRef, useState } from 'react'

export interface SelectOption {
	value: string
	label: string
	disabled?: boolean
}

/**
 * Themed custom select — a styled trigger + a dropdown panel (native <select>
 * can't be fully themed). Closes on outside-click / Escape, supports arrow-key
 * navigation, and skips disabled options.
 */
export function Select({
	value,
	options,
	onChange,
	disabled,
	placeholder,
	fullWidth,
	title,
	ariaLabel,
}: {
	value: string
	options: SelectOption[]
	onChange: (value: string) => void
	disabled?: boolean
	placeholder?: string
	fullWidth?: boolean
	title?: string
	ariaLabel?: string
}) {
	const [open, setOpen] = useState(false)
	const [active, setActive] = useState(-1)
	const rootRef = useRef<HTMLDivElement>(null)

	const selected = options.find(o => o.value === value)

	useEffect(() => {
		if (!open) return
		const onDoc = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', onDoc)
		return () => document.removeEventListener('mousedown', onDoc)
	}, [open])

	const openMenu = () => {
		if (disabled) return
		setActive(options.findIndex(o => o.value === value))
		setOpen(true)
	}
	const choose = (option: SelectOption) => {
		if (option.disabled) return
		onChange(option.value)
		setOpen(false)
	}
	const move = (dir: 1 | -1) => {
		setActive(prev => {
			let i = prev
			for (let n = 0; n < options.length; n++) {
				i = (i + dir + options.length) % options.length
				if (!options[i]?.disabled) return i
			}
			return prev
		})
	}
	const onKeyDown = (e: React.KeyboardEvent) => {
		if (disabled) return
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
				e.preventDefault()
				openMenu()
			}
			return
		}
		if (e.key === 'Escape') {
			e.preventDefault()
			setOpen(false)
		} else if (e.key === 'ArrowDown') {
			e.preventDefault()
			move(1)
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			move(-1)
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			const option = options[active]
			if (option) choose(option)
		}
	}

	return (
		<div ref={rootRef} style={{ position: 'relative', width: fullWidth ? '100%' : undefined }}>
			<button
				type="button"
				disabled={disabled}
				title={title}
				aria-label={ariaLabel}
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={() => (open ? setOpen(false) : openMenu())}
				onKeyDown={onKeyDown}
				style={{
					width: '100%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 8,
					padding: '8px 10px',
					background: 'var(--bg-2)',
					border: `1px solid ${open ? 'var(--border-hover)' : 'var(--border)'}`,
					borderRadius: 'var(--radius-sm)',
					color: selected ? 'var(--text-1)' : 'var(--text-4)',
					fontSize: 12,
					fontFamily: 'var(--font-sans)',
					cursor: disabled ? 'not-allowed' : 'pointer',
					opacity: disabled ? 0.6 : 1,
					textAlign: 'left',
					outline: 'none',
				}}
			>
				<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
					{selected ? selected.label : (placeholder ?? 'Select…')}
				</span>
				<span
					style={{
						color: 'var(--text-4)',
						fontSize: 10,
						flexShrink: 0,
						transform: open ? 'rotate(180deg)' : 'none',
						transition: 'transform 120ms',
					}}
				>
					▾
				</span>
			</button>

			{open && (
				<div
					style={{
						position: 'absolute',
						top: 'calc(100% + 4px)',
						left: 0,
						right: 0,
						zIndex: 50,
						background: 'var(--bg-2)',
						border: '1px solid var(--border-hover)',
						borderRadius: 'var(--radius-sm)',
						boxShadow: 'var(--shadow)',
						padding: 4,
						maxHeight: 280,
						overflowY: 'auto',
					}}
				>
					{options.map((option, i) => {
						const isSelected = option.value === value
						const isActive = i === active
						return (
							<button
								key={option.value}
								type="button"
								disabled={option.disabled}
								onClick={() => choose(option)}
								onMouseEnter={() => !option.disabled && setActive(i)}
								style={{
									width: '100%',
									textAlign: 'left',
									padding: '6px 10px',
									border: 'none',
									borderRadius: 'var(--radius-sm)',
									background: isActive && !option.disabled ? 'var(--bg-3)' : 'transparent',
									color: option.disabled ? 'var(--text-4)' : isSelected ? 'var(--accent)' : 'var(--text-1)',
									fontSize: 12,
									fontWeight: isSelected ? 600 : 400,
									fontFamily: 'var(--font-sans)',
									cursor: option.disabled ? 'not-allowed' : 'pointer',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: 8,
								}}
							>
								<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
									{option.label}
								</span>
								{isSelected && <span style={{ fontSize: 11 }}>✓</span>}
							</button>
						)
					})}
				</div>
			)}
		</div>
	)
}
