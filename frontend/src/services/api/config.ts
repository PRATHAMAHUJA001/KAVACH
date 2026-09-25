/** VITE_USE_MOCKS=true serves every endpoint from MSW; false talks to the FastAPI backend. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
