// Set VITE_WAITLIST_MODE=true only on the production Netlify site to lock the
// app behind a waitlist form. Unset (the default everywhere else — local dev,
// staging) compiles this to `false` and the whole waitlist UI/guard path is
// dead-code-eliminated out of the bundle, mirroring StagingGate's pattern.
export const WAITLIST_MODE = import.meta.env.VITE_WAITLIST_MODE === 'true'
