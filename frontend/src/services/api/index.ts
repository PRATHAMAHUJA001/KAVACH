export * from "./queries";
export * as api from "./client";
export { ApiError } from "./client";
export { USE_MOCKS } from "./config";
export type * from "./models";
/** Auth has no domain model of its own — the login screen uses the wire shapes. */
export type { AuthContextDTO, AuthProfileDTO, AuthRoleDTO } from "./dto";
