import { coreHandlers } from "./core";
import { alertHandlers } from "./alerts";
import { customerHandlers } from "./customers";
import { ringHandlers } from "./rings";
import { ruleHandlers } from "./rules";
import { riskHandlers } from "./risk";
import { timeMachineHandlers } from "./timeMachine";
import { askHandlers } from "./ask";

export const handlers = [
  ...coreHandlers,
  ...alertHandlers,
  ...customerHandlers,
  ...ringHandlers,
  ...ruleHandlers,
  ...riskHandlers,
  ...timeMachineHandlers,
  ...askHandlers,
];
