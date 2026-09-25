import { coreHandlers } from "./core";
import { alertHandlers } from "./alerts";
import { ringHandlers } from "./rings";
import { ruleHandlers } from "./rules";
import { timeMachineHandlers } from "./timeMachine";
import { askHandlers } from "./ask";

export const handlers = [...coreHandlers, ...alertHandlers, ...ringHandlers, ...ruleHandlers, ...timeMachineHandlers, ...askHandlers];
