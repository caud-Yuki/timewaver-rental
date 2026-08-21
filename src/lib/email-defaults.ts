/**
 * @fileOverview Frontend view of the system default email templates.
 *
 * This file intentionally holds no data. The canonical `SYSTEM_TEMPLATES`
 * array lives in `functions/src/email-defaults.ts` — it has to, because
 * Firebase uploads only the `functions/` directory and compiles it with
 * `include: ["src"] → outDir: "lib"`, so the backend cannot import a module
 * from outside `functions/src`. The Next app can import across the project
 * root, so the dependency points this way and the two sides can no longer
 * drift apart.
 *
 * Consumers: /admin/email-templates (lists and lets admins override the
 * defaults) and /admin/email-triggers (fills the per-event dropdowns).
 */
export type { SystemTemplate } from '../../functions/src/email-defaults';
export { SYSTEM_TEMPLATES } from '../../functions/src/email-defaults';
