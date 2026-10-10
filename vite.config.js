import {defineConfig} from 'vite'
import {fileURLToPath} from 'url'

// Library build: ESM for bundlers, UMD for a plain <script> tag.
// Leaflet stays external and maps to the global `L` in the UMD output.
export default defineConfig({
    build: {
        target: 'es2015',
        lib: {
            entry: fileURLToPath(new URL('./src/index.js', import.meta.url)),
            name: 'LeafletMassMarkers',
            formats: ['es', 'umd'],
            fileName: (format) => format === 'es'
                ? 'leaflet-mass-markers.js'
                : 'leaflet-mass-markers.umd.cjs'
        },
        rollupOptions: {
            external: ['leaflet'],
            output: {
                globals: {leaflet: 'L'},
                exports: 'named'
            }
        },
        sourcemap: true,
        minify: 'esbuild',
        emptyOutDir: true
    }
})
