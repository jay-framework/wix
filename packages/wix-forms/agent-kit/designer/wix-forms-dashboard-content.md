# wix-forms — dashboard-managed content

**Plugin** `@jay-framework/wix-forms` · **contracts** `form/<slug>` (one per Wix form, e.g. `form/contact`).

A form's fields, labels, placeholders, required flags, and options come from **Wix Forms** and are edited in the **Wix dashboard** form builder. When asked to change them: **do not edit code** — never hard-code a label or replace a `{…}` binding in jay-html, not even for one page. Identify the form with the steps below. **Never write without a form id from these steps.** When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives the forms-list link and never writes.

Post-submit thank-you text, submit **button** label on Jay pages, and most validation wording are **not** dashboard fields — see `agent-kit/plugin/user-visible-messages.md`.

**Mixed requests** (e.g. "rename this field and make it wider"): edit the jay-html part normally, and handle the form field part with the steps below.

## Agent behavior

### Reply style

Keep replies to the site owner **short and simple** (about 1–3 sentences). They are often non-technical — use everyday words and a visual or business angle. Say **what** changed or **where** they can change the form in Wix. Do **not** put file paths, code, binding syntax, or form ids in the thread reply (use ids only in tools and in the steps below).

### Update data or send a link

- **Try to update** the form when you are **confident** you have the right form id (step 2), the request is **unambiguous**, and you have a **Wix API or tool** that can apply the change. After a successful update, confirm in plain language and include the dashboard link from step 4 so they can review.
- If you are **not** confident, the request is **ambiguous**, or you **lack** a working update tool → **do not write**. Build the dashboard link when you can and tell them to use the Wix form builder.
- If an update **fails** → say so briefly and give the dashboard link.

Do not hard-code form labels or field values into jay-html.

### Ambiguity and area markers

A screenshot may show **several fields** inside one **area marker**, but inspect returns **one** `Target source` (one element, at most **one** field context from step 3).

When you are unsure — several fields visible, the comment does not name which field, or the resolved field may not match what they meant — **do not write**. Explain briefly what you see, which field (if any) the mark resolved to, and **ask them to clarify** (name the field or mark one field at a time). Use the [forms list](#fallbacks) when the form itself is unclear; use the form edit link when step 2 gave one clear form id.

## How to find this guide (materialized contracts)

1. Resolve the contract name from the inspector (wix-forms page script `contract="form/…"` and `key="K"` — see below).
2. Read `agent-kit/plugins-index.yaml` → that contract's `path` (materialized `form-<slug>.jay-contract`).
3. On that file, read **`formId`** and **`editingGuide`** (project-root path to this shared procedure). Open **`editingGuide`** and follow it, using **`formId`** from the contract — never guess from the slug alone.
4. Fallback mapping: `agent-kit/references/wix-forms/forms.yaml` lists each `contract` with its `formId` and field `target` names.
5. Do **not** rely on AIditor to paste the guide — follow the paths above.

## What you get

When the user clicks an element in the editor, you get the **source-editing inspector result**: `file` (the page jay-html), `node` (the clicked element: `lines`, `tag`, `html` — its open tag, attributes and own text) and `stack` — enclosing frames, **innermost → outermost**:

- `{ kind: 'forEach', lines, itemId }` — a repeated item; `itemId` is the value of its `trackBy` (e.g. select options: `forEach="K.country.options"` with `trackBy="value"`).
- `{ kind: 'region', lines, name, props? }` — a `<jay:NAME …>` instance; `name` is the contract name (uncommon for wix-forms — forms are usually page scripts only).

All `lines` are 1-based ranges in `file`. Per-form contracts are added as page scripts — `<script type="application/jay-headless" plugin="@jay-framework/wix-forms" contract="form/<slug>" key="K">` in `<head>` — which produce **no** `region` frame; field bindings look like `{K.email.label}`, `ref="K.email.input"`, `ref="K.submitButton"`. Only scripts with `plugin="@jay-framework/wix-forms"` count. A page may have **several** such scripts (several forms); pick the script whose `key` prefixes the clicked element's bindings or refs.

No inspector result → fallback.

## Steps

1. **Find the contract and script key.** In `file`, find wix-forms headless script(s): `plugin="@jay-framework/wix-forms"`, `contract="form/…"`, `key="K"`. If several scripts exist, use the one whose `K` matches the binding/ref prefix on the clicked element (e.g. `{newsletter.email.label}` → `key="newsletter"`). The **`contract`** slug is not the same as **`key`** — both are needed; form identity comes from the contract, not from `key`.
2. **Form id** = top-level **`formId`** on that contract's materialized `.jay-contract` (see [How to find this guide](#how-to-find-this-guide-materialized-contracts)). Fallback: the matching entry in `agent-kit/references/wix-forms/forms.yaml` (`contract` + `formId`), or `metadata.formId` on the same contract in `plugins-index.yaml`. **Never** use `defaultFormId` or a `formId` attribute on markup — those are removed.
3. **Find the field** (for naming only): read `file` at `node.lines` — bindings/refs use `K.<target>.…` (e.g. `{contact.email.label}`, `ref="contact.email.input"`). The **`<target>`** segment is the field's internal name; confirm label/type in `forms.yaml`. Do not use a generic `forEach="K.fields"` — it is no longer supported.
4. **Build the link** with `wix-server-client/getDashboardUrl`:
   - edit the form → `{ "path": "wix-forms/form/<formId>" }`
   - "see / export the submissions" → `{ "path": "wix-forms/form/<formId>/submissions" }`

   Run from the project root: `npx jay-stack-cli action wix-server-client/getDashboardUrl --input '{"path":"…"}'`; the output's `url` is the link. Never read `config/.wix.yaml` or other credential files to build it.

5. **Reply** (see [Agent behavior](#agent-behavior)): plain language only — e.g. “This field is set up in your Wix form builder; change the label here: <url>” or “I updated the label; you can review the form here: <url>”.

## Fallbacks

Give the forms-list link — path `wix-forms` — and say you couldn't identify the specific form.

Fall back when: there is no inspector result; no wix-forms page script matches the clicked bindings; the contract has no `formId` in the materialized file or `forms.yaml`; or the field target cannot be read from bindings.

If `wix-server-client/getDashboardUrl` itself fails, give no link: say the form is edited in the Wix dashboard (Forms) and that you couldn't build the link.

## Not dashboard content

- **Which** Wix form a block uses → the page script's `contract="form/<slug>"` (and `key` for bindings only).
- Layout, CSS, submit button label, and customized success/thank-you copy → **jay-html** (plugin sets a default English `statusMessage` on success; localized sites should use `if="key.statusMessage"` with static page text — see `agent-kit/plugin/user-visible-messages.md`).
- Generic load/submit messages on `loadError` / `statusMessage` and client validation templates on `{key.field.error}` → mostly **plugin English**; field names inside errors still follow Wix labels when bound from `{key.field.label}`.
