import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // @mui/material/internal/Transition.mjs does a *directory* import of
  // react-transition-group/TransitionGroupContext. The browser build resolves it
  // fine, but Node's ESM loader cannot, so every SSR pass threw
  // ERR_UNSUPPORTED_DIR_IMPORT. The page still rendered (SSR falls back to client
  // rendering), which is why this went unnoticed — but the devtools plugin
  // forwards client console output to the server, the server logs it, the client
  // picks it up and forwards it again, and the message grows exponentially.
  // Left alone it writes gigabytes of nested log lines and eventually kills the
  // dev server with ENOSPC. Bundling these for SSR lets Vite's resolver handle
  // the directory import, which removes the error and the feedback loop with it.
  ssr: {
    noExternal: ['@mui/material', '@mui/x-date-pickers', 'react-transition-group'],
  },
  plugins: [devtools(), netlify(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
