// Keep the dev-only React refresh preamble external so production CSP can stay strict.
// @ts-expect-error Vite serves this development-only virtual module.
import { injectIntoGlobalHook } from '/@react-refresh';
injectIntoGlobalHook(window);
Object.assign(window, { $RefreshReg$: () => {}, $RefreshSig$: () => (type: unknown) => type, __vite_plugin_react_preamble_installed__: true });
