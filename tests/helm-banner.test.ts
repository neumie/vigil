import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ui = readFileSync(new URL('../app/src/renderer/sidebar/ui.tsx', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../app/src/renderer/sidebar/SettingsPage.tsx', import.meta.url), 'utf8')
const bannerStory = readFileSync(new URL('../app/src/renderer/sidebar/Banner.stories.tsx', import.meta.url), 'utf8')
const clampStory = readFileSync(new URL('../app/src/renderer/sidebar/ClampText.stories.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/src/renderer/sidebar/sidebar.css', import.meta.url), 'utf8')

test('actionable state is an action slot on the shared Banner primitive', () => {
	assert.match(ui, /action\?: ReactNode/)
	assert.match(ui, /<output className=\{`banner banner-\$\{tone\} banner-actionable`\}>/)
	assert.match(settings, /<Banner[\s\S]*tone="info"[\s\S]*label="Restart required"[\s\S]*action=/)
	assert.match(settings, /<Btn tone="quiet" sm/)
	assert.doesNotMatch(settings, /restart-notice/)
	assert.match(css, /\.banner-actionable\s*\{[^}]*align-items:\s*start/s)
})

test('Storybook classifies banner and clamped prose as separate primitives', () => {
	assert.match(bannerStory, /title: 'Primitives\/Banner'/)
	assert.match(bannerStory, /export const WithAction/)
	assert.doesNotMatch(bannerStory, /ErrorClamped|Save changes|ClampText/)
	assert.match(clampStory, /title: 'Primitives\/Clamp text'/)
})
