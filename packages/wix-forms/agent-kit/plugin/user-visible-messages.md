User-visible copy on Wix Forms pages (headless `form/<slug>` contracts).

**Rule:** the plugin tells the page **what happened** through variants; the **words** are the page's. Plugin strings are English **defaults**: bind them when English is fine, otherwise branch on the variants and write your own copy in jay-html.

## Who owns each string

| What visitors see | Source | Edited where |
| ----------------- | ------ | ------------ |
| Field **labels**, **placeholders**, select **option** labels | Wix Forms API (form schema) | **Wix dashboard** form builder — bind `{key.<target>.label}`, `{key.<target>.placeholder}`, option `{label}` |
| **Submit button** label | Page markup | **jay-html** — text inside `<button ref="key.submitButton">…</button>` (not read from Wix on the headless path) |
| **Success** after submit | Page markup | **jay-html** — `if="key.submitState === SUCCEEDED"` (or `key.isSubmitted`) + your copy |
| **Submit failure** | `submitFailure` variant (+ English default in `statusMessage`) | **jay-html** — branch on `key.submitFailure` |
| **Load failure** (`loadError`) | Plugin (`wix-form` component) | English defaults; customize display in jay-html or hide the binding |
| **Field validation** (`key.<target>.error`) | Plugin client validation + Wix API on submit | Message **templates** are English in the plugin; `{label}` inside messages comes from Wix |
| Layout, CSS, surrounding copy | Page | **jay-html** |

There is **no** setting in `config/.wix-forms.yaml` for message text — copy lives in jay-html.

## Submit outcome — `submitState` and `submitFailure`

| Tag | Values |
| --- | ------ |
| `submitState` | `IDLE`, `SUBMITTING`, `SUCCEEDED`, `FAILED` |
| `submitFailure` | `NONE` (not failed), `VALIDATION`, `REJECTED`, `PERMISSION`, `NETWORK`, `UNKNOWN` |

| `submitFailure` | Meaning | Where details are |
| --------------- | ------- | ----------------- |
| `VALIDATION` | Client checks failed, or Wix rejected specific fields | `{key.<target>.error}` per visible field; hidden-field errors in `statusMessage` |
| `REJECTED` | Wix refused the submission, or a server submit hook rejected it | A hook's `ActionError` message is in `statusMessage` |
| `PERMISSION` | Wix denied the caller (401 / 403), the session expired, or the request had no session cookie | — |
| `NETWORK` | The request did not complete (offline, timeout) | — |
| `UNKNOWN` | Server-side failure (logged on the server) | — |

### Localized / custom copy (recommended)

```html
<section if="contact.submitState === SUCCEEDED" ref="contact.confirmation" tabindex="-1">
  Merci — nous avons bien reçu votre message.
</section>

<p role="alert" if="contact.submitState === FAILED">
  <span if="contact.submitFailure === VALIDATION">Vérifiez les champs en rouge.</span>
  <span if="contact.submitFailure === NETWORK">Problème de connexion, réessayez.</span>
  <span if="contact.submitFailure === REJECTED">{contact.statusMessage}</span>
  <span if="contact.submitFailure === PERMISSION">Impossible d'envoyer ce formulaire. Actualisez la page et réessayez.</span>
  <span if="contact.submitFailure === UNKNOWN">Une erreur est survenue. Réessayez plus tard.</span>
</p>
```

Binding `{contact.statusMessage}` for `REJECTED` is a choice: it shows a hook's own message (which the hook author controls). Write static copy instead if hooks may return English.

### English default (fine for English sites)

```html
<p class="form-status" if="contact.statusMessage">{contact.statusMessage}</p>
```

`statusMessage` is empty on success, and empty on a client-validation failure (errors are on the fields). Do **not** test `statusMessage` to detect a failure — use `submitState`.

## `loadError`

When the form schema fails to load, `loadError` is set (e.g. `Could not load the form.`, permission-denied hints). Bind `{key.loadError}` if you want to show it, or use `if="contact.loadError"` with your own localized explanation.

## Field `{key.<target>.error}`

Client-side checks use English templates such as `Please enter a valid email address.` and `` `${label} is required.` `` (label from Wix). Server field violations use Wix’s `errorMessage` when present; otherwise the plugin may use `Invalid value`.

For multilingual sites, Wix-translated **labels** help required messages. Use `if="key.<target>.invalid"` with your own copy when the English templates don't fit.

## `getFormSummary` (bookings / participant fields)

`validateFormSummaryField` uses the same English validation patterns. That path is separate from the page `wixForm` UI; bookings integration is covered by the setup guide (`wix-forms-setup.md`) shipped in the `@jay-framework/wix-forms` package.

## Agent checklist

- **Change a field label** → Wix dashboard (see `agent-kit/references/wix-forms/wix-forms-dashboard-content.md`), keep `{key.field.label}` bindings.
- **Change thank-you / success text** → jay-html under `if="key.submitState === SUCCEEDED"`.
- **Change or translate a submit error** → jay-html branches on `key.submitFailure`; never match on `statusMessage` text.
- **Change submit button text** → jay-html button content, not Wix.
- **Do not** hard-code field labels in jay-html when they should stay dashboard-managed.
