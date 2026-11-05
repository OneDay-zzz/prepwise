import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { checkpointPlugin } from './server/checkpoint-plugin.mjs';
export default defineConfig(({mode})=>({plugins:[react(),checkpointPlugin(mode)],server:{watch:{ignored:['**/documents/**','**/.prepwise/**']}}}));
