# Changelog — @jay-framework/wix-members

## Unreleased

### Added

1. **Credential lifecycle validators.** `jay-stack validate` now checks pages that log in or sign up members
   with `login()` / `register()`:
   - `credentials-page`: `password-not-in-form`, `password-type` and `autocomplete-role` (errors), and
     `identifier-autocomplete` (warning).
   - `credentials-project` (project validator): `no-password-reset` and `token-in-storage` (warnings), and
     `secret-in-storage` (error).

   Suppress per page with `<script type="application/jay-validations">wix-members: { <rule>: true }</script>`,
   or per project under `.jay` `validations.wix-members`.
2. New guide `agent-kit/plugin/wix-members-direct-login.md`: form templates, autocomplete roles, password
   reset, and why there are no member passkeys yet.
3. `typescript` (>=5) is an optional peer dependency: the validators parse page TS. Without it, validate
   prints one `[wix-members/typescript-missing]` warning.

### Fixed

1. `agent-kit/` is now included in the published package, so its guides reach consuming projects.
