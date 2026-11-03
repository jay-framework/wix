# wix-members — session state, not content

**Plugin** `@jay-framework/wix-members` · **contracts** `login-indicator`, `auth-callback`, `protected-page` (all `readonly: true`).

Login status, the member's name and avatar, and auth redirects are the **visitor's session state**, not site content. When asked to change them: edit **no data**, and **never hard-code a value or replace a `{…}` binding** in jay-html (e.g. turning `{memberName}` into a fixed name) — not even for one page. Reply:

"This shows the visitor's session state (their login), not site content. There is nothing to edit here; change the template markup if you meant its look."

## Not session state

Props such as `protected-page` `loginUrl`, layout, CSS and markup live in jay-html — edit those normally.
