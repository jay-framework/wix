# wix-forms — dashboard-managed content

**Plugin** `@jay-framework/wix-forms` · **contract** `wix-form`.

A form's fields, labels, placeholders, required flags, options and submit text come from **Wix Forms** and are edited in the **Wix dashboard** form builder. When asked to change them: **Do not edit code.** If you can update the data at its source (a Wix API or tool you have access to), you may do so and say exactly what you changed\; otherwise give the dashboard link below.

## Steps

1. Form id = the region's `formId` prop; with no prop, `defaultFormId` in `config/.wix-forms.yaml`.
2. Call `wix-server-client/getDashboardUrl` with `{ "path": "wix-forms/form/<formId>" }`.
   For "see / export the submissions": `{ "path": "wix-forms/form/<formId>/submissions" }`.
3. Reply: "This form is edited in the Wix dashboard form builder: <url>" and name the field you were asked about.

No form id → path `wix-forms` (the forms list).

## Not dashboard content

- **Which** form the page shows → the `formId` prop in jay-html.
- Layout, CSS, markup, success/error messages written in the template → jay-html.
