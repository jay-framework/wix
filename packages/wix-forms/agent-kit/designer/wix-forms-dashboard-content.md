# wix-forms — dashboard-managed content

**Plugin** `@jay-framework/wix-forms` · **contract** `wix-form`.

A form's fields, labels, placeholders, required flags, options and submit text come from **Wix Forms** and are edited in the **Wix dashboard** form builder. When asked to change them: **do not edit code** — never hard-code a label or replace a `{…}` binding in jay-html, not even for one page. Identify the form with the steps below, then either update it at its source (a Wix API or tool you have access to) and say exactly what you changed, or give its dashboard link. **Never write without a form id from these steps.** When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives the forms-list link and never writes.

**Mixed requests** (e.g. "rename this field and make it wider"): edit the jay-html part normally, and give the dashboard link for the data part.

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
4. **Reply:**
   - link: "This form is edited in the Wix dashboard form builder: <url>", naming the field (its visible label in `node.html`, or its `target`);
   - write: "Updated <property> of field <target> in form <formId> from <old> to <new>." and add the dashboard link.

## Fallbacks

Give the forms-list link — path `wix-forms` — and say you couldn't identify the specific form.

Fall back when: there is no inspector result; no form id is found; `formId` is a binding; or `config/.wix-forms.yaml` has no `defaultFormId`.

If `wix-server-client/getDashboardUrl` itself fails, give no link: say the form is edited in the Wix dashboard (Forms) and that you couldn't build the link.

## Not dashboard content

- **Which** form the page shows → the `formId` prop in jay-html.
- Layout, CSS, markup, and success/error messages written in the template → jay-html.
