import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins:[react()],
  server:{port:3000,strictPort:true},
  preview:{port:3000,strictPort:true},
  build:{
    rolldownOptions:{
      output:{
        // Vite 8 / Rolldown: stable library groups improve shared vendor caching
        // and avoid shipping the entire admin UI as one 900+ KiB chunk.
        // Keep backend secrets and all auth checks exclusively server-side.
        codeSplitting:{
          groups:[
            {name:'ra-core',test:/[\\/]ra-core[\\/]/,priority:40},
            {name:'ra-ui',test:/[\\/]ra-ui-material[\\/]/,priority:35},
            {name:'mui-vendor',test:/[\\/]@mui[\\/]/,priority:20},
          ],        },
      },
    },
  },
});
