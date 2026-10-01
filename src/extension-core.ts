/**
 * Entry point bundled into the browser extension (integrations/browser-extension/core.js)
 * so it can classify, schedule and decide on its own when the local app is not running.
 * Everything here is pure: no Node, no fetch, no DOM.
 */
export { assess } from "./core/assess";
export { addEventsTo, addSignalsTo, applySettingsPatch, buildPromptEvent, emptyLedger, normalizeLedger, parseSignal } from "./core/ledger";
export { buildSnapshot } from "./core/summary";
export { localDateKey } from "./core/time";
