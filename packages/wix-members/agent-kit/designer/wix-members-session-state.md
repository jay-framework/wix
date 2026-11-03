# wix-members — session state, not content

**Plugin** `@jay-framework/wix-members` · **contracts** `login-indicator`, `auth-callback`, `protected-page` (all `readonly: true`).

Login status, the member's name and avatar, and auth redirects are the **visitor's session state**, not site content. When asked to change them, edit no code and no data, and reply:

"This shows the visitor's session state (cart / login), not site content. There is nothing to edit here; change the template markup if you meant its look."

Props such as `protected-page` `loginUrl`, layout, CSS and markup live in jay-html — edit those normally.
