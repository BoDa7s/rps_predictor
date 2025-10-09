export const DEV_MODE_ENABLED = import.meta.env.VITE_DEV_MODE === "true";
export const DEV_MODE_SECURE = import.meta.env.VITE_DEV_MODE_SECURE === "true" && DEV_MODE_ENABLED;
