import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
	plugins: [solid()],
	build: {
		outDir: 'dist',
		emptyOutDir: false,
		rollupOptions: {
			input: {
				content: 'src/content.tsx',
				popup: 'src/popup.ts',
			},
			output: {
				entryFileNames: '[name].js',
				format: 'iife',
			},
		},
	},
})
