// The ai-service is not deployed everywhere (not in production yet). AI import
// shows in the menu only when the build says the service is there: VITE_AI_IMPORT=on.
export const AI_IMPORT_ENABLED = import.meta.env.VITE_AI_IMPORT === 'on'
