# wix-forms — dashboard-managed content

**Plugin** `@jay-framework/wix-forms` · **contract** `wix-form`.

A form's fields, labels, placeholders, required flags, options and submit text come from **Wix Forms** and are edited in the **Wix dashboard** form builder. When asked to change them: **do not edit code** — never hard-code a label or replace a `{…}` binding in jay-html, not even for one page. Identify the form with the steps below. **Never write without a form id from these steps.** When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives the forms-list link and never writes.

**Mixed requests** (e.g. "rename this field and make it wider"): edit the jay-html part normally, and handle the form field part with the steps below.

## Agent behavior

### Reply style

Keep replies to the site owner **short and simple** (about 1–3 sentences). They are often non-technical — use everyday words and a visual or business angle. Say **what** changed or **where** they can change the form in Wix. Do **not** put file paths, code, binding syntax, or form ids in the thread reply (use ids only in tools and in the steps below).

### Update data or send a link

- **Try to update** the form when you are **confident** you have the right form id (step 1), the request is **unambiguous**, and you have a **Wix API or tool** that can apply the change. After a successful update, confirm in plain language and include the dashboard link from step 3 so they can review.
- If you are **not** confident, the request is **ambiguous**, or you **lack** a working update tool → **do not write**. Build the dashboard link when you can and tell them to use the Wix form builder.
- If an update **fails** → say so briefly and give the dashboard link.

Do not hard-code form labels or field values into jay-html.

### Ambiguity and area markers

A screenshot may show **several fields** inside one **area marker**, but inspect returns **one** `Target source` (one element, at most **one** field context from step 2).

When you are unsure — several fields visible, the comment does not name which field, or the resolved field may not match what they meant — **do not write**. Explain briefly what you see, which field (if any) the mark resolved to, and **ask them to clarify** (name the field or mark one field at a time). Use the [forms list](#fallbacks) when the form itself is unclear; use the form edit link when step 1 gave one clear form id.

## What you get

When the user clicks an element in the editor, you get the **source-editing inspector result**: `file` (the page jay-html), `node` (the clicked element: `lines`, `tag`, `html` — its open tag, attributes and own text) and `stack` — enclosing frames, **innermost → outermost**:

- `{ kind: 'forEach', lines, itemId }` — a repeated item; `itemId` is the value of its `trackBy`.
- `{ kind: 'region', lines, name, props? }` — a `<jay:NAME …>` instance; `props` are its static props.

All `lines` are 1-based ranges in `file`. Count a `region` frame named `wix-form` only if `<head>` has `<script type="application/jay-headless" plugin="@jay-framework/wix-forms" contract="wix-form">`.

No inspector result → fallback.

## Steps

1. **Find the form id.**
   - `stack` has a `region` frame named `wix-form`: form id = its `props.formId`; if missing, read the `formId="…"` attribute on the `<jay:wix-form>` tag in `file` at the frame's `lines`. If that attribute is a binding (`{…}`) → fallback. If the tag has no `formId` at all → `defaultFormId` in `config/.wix-forms.yaml`.
   - No `wix-form` region frame, but `<head>` has a `wix-form` page script with `key="K"` → `defaultFormId` in `config/.wix-forms.yaml`.
   - Otherwise → fallback.
2. **Find the field** (for naming only): the `forEach` frame whose element in `file` has `forEach="fields"` (or `K.fields`) — its `itemId` is the field's `target` (its internal name). Option `forEach`s (`trackBy="id"`) are choices inside a field.
3. **Build the link** with `wix-server-client/getDashboardUrl`:
   - edit the form → `{ "path": "wix-forms/form/<formId>" }`
   - "see / export the submissions" → `{ "path": "wix-forms/form/<formId>/submissions" }`

   Run from the project root: `npx jay-stack-cli action wix-server-client/getDashboardUrl --input '{"path":"…"}'`; the output's `url` is the link. Never read `config/.wix.yaml` or other credential files to build it.

4. **Reply** (see [Agent behavior](#agent-behavior)): plain language only — e.g. “This field is set up in your Wix form builder; change the label here: <url>” or “I updated the label; you can review the form here: <url>”.

## Fallbacks

Give the forms-list link — path `wix-forms` — and say you couldn't identify the specific form.

Fall back when: there is no inspector result; no form id is found; `formId` is a binding; or `config/.wix-forms.yaml` has no `defaultFormId`.

If `wix-server-client/getDashboardUrl` itself fails, give no link: say the form is edited in the Wix dashboard (Forms) and that you couldn't build the link.

## Not dashboard content

- **Which** form the page shows → the `formId` prop in jay-html.
- Layout, CSS, markup, and success/error messages written in the template → jay-html.
