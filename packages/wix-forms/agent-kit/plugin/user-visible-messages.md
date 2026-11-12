User-visible copy on Wix Forms pages (headless `form/<slug>` contracts).

**Rule:** the plugin tells the page **what happened** through variants; the **words** are the page's. Plugin strings are English **defaults**: bind them when English is fine, otherwise branch on the variants and write your own copy in jay-html.

## Who owns each string

| What visitors see                                            | Source                                                         | Edited where                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Field **labels**, **placeholders**, select **option** labels | Wix Forms API (form schema)                                    | **Wix dashboard** form builder — bind `{key.<target>.label}`, `{key.<target>.placeholder}`, option `{label}`    |
| **Submit button** label                                      | Page markup                                                    | **jay-html** — text inside `<button ref="key.submitButton">…</button>` (not read from Wix on the headless path) |
| **Success** after submit                                     | Page markup                                                    | **jay-html** — `if="key.submitState === SUCCEEDED"` (or `key.isSubmitted`) + your copy                          |
| **Submit failure**                                           | `submitFailure` variant (+ English default in `statusMessage`) | **jay-html** — branch on `key.submitFailure`                                                                    |
| **Load failure** (`loadError`)                               | Plugin (`wix-form` component)                                  | English defaults; customize display in jay-html or hide the binding                                             |
| **Field validation** (`key.<target>.error`)                  | Plugin client validation + Wix API on submit                   | Message **templates** are English in the plugin; `{label}` inside messages comes from Wix                       |
| Layout, CSS, surrounding copy                                | Page                                                           | **jay-html**                                                                                                    |

There is **no** setting in `config/.wix-forms.yaml` for message text — copy lives in jay-html.

## Submit outcome — `submitState` and `submitFailure`

| Tag             | Values                                                                            |
| --------------- | --------------------------------------------------------------------------------- |
| `submitState`   | `IDLE`, `SUBMITTING`, `SUCCEEDED`, `FAILED`                                       |
| `submitFailure` | `NONE` (not failed), `VALIDATION`, `REJECTED`, `PERMISSION`, `NETWORK`, `UNKNOWN` |

| `submitFailure` | Meaning                                                                                      | Where details are                                                                |
| --------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `VALIDATION`    | Client checks failed, or Wix rejected specific fields                                        | `{key.<target>.error}` per visible field; hidden-field errors in `statusMessage` |
| `REJECTED`      | Wix refused the submission, or a server submit hook rejected it                              | A hook's `ActionError` message is in `statusMessage`                             |
| `PERMISSION`    | Wix denied the caller (401 / 403), the session expired, or the request had no session cookie | —                                                                                |
| `NETWORK`       | The request did not complete (offline, timeout)                                              | —                                                                                |
| `UNKNOWN`       | Server-side failure (logged on the server)                                                   | —                                                                                |

### Localized / custom copy (recommended)

```html
<section if="contact.submitState === SUCCEEDED" ref="contact.confirmation" tabindex="-1">
  Merci — nous avons bien reçu votre message.
</section>

<p role="alert" if="contact.submitState === FAILED">
  <span if="contact.submitFailure === VALIDATION">Vérifiez les champs en rouge.</span>
  <span if="contact.submitFailure === NETWORK">Problème de connexion, réessayez.</span>
  <span if="contact.submitFailure === REJECTED">{contact.statusMessage}</span>
  <span if="contact.submitFailure === PERMISSION"
    >Impossible d'envoyer ce formulaire. Actualisez la page et réessayez.</span
  >
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

Client-side checks use English templates such as `Please enter a valid email address.` and `` `${label} is required.` `` (label from Wix). Server field violations the plugin classifies (Wix format errors for Email / Phone / URL) use the same English default text as the browser check and the matching `errorRule`; other server field violations use Wix’s `errorMessage` (or the owner's custom message) when present, otherwise `Invalid value`.

The browser's Email / URL rules are never stricter than Wix's: a value Wix stores is never blocked in the browser, and a value only Wix refuses comes back after submit. Phones are sent as compact international numbers (`+972541234567`) while the input shows what the visitor typed; the browser refuses a phone it cannot send as an international number (`PHONE`), or one typed without a country code when no default country is known (`PHONE_COUNTRY`, see `defaultPhoneCountry` in `rich-forms.md` §3). `required` is enforced in the browser only — Wix accepts and confirms empty required fields and out-of-options choice values when the site posts; a site that needs server enforcement refuses in its submit hook with `FieldRejection` (`rich-forms.md` §7).

For multilingual sites, Wix-translated **labels** help required messages. When the English templates don't fit, branch on the field's **`errorRule`** variant and write your own copy — the same outcome-vs-text rule as `submitFailure`: the variant says which rule failed, the words are yours.

| `errorRule`                 | Meaning                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `NONE`                      | No error shown                                                           |
| `REQUIRED`                  | Empty required field (unchecked checkbox, nothing selected)              |
| `MIN_LENGTH` / `MAX_LENGTH` | Too short / too long (Wix schema)                                        |
| `EMAIL` / `PHONE` / `URL`   | Wrong format for the field type                                          |
| `PATTERN`                   | Does not match the Wix field's pattern                                   |
| `PHONE_COUNTRY`             | Phone without a country code and no default country, or from a country the Wix Phone field does not accept |
| `CUSTOM`                    | A page check failed — `error` is the page check's own message            |
| `SERVER`                    | Wix refused the field for a reason the plugin does not classify, or the site owner's custom message — `error` is Wix's text |
| `HOOK`                      | The submit hook's `FieldRejection` — `error` is the hook's own text                                                         |

```html
<span if="contact.email.errorRule === REQUIRED">Indiquez votre e-mail.</span>
<span if="contact.email.errorRule === EMAIL">Cet e-mail ne semble pas valide.</span>
<span if="contact.email.errorRule === CUSTOM">{contact.email.error}</span>
<span if="contact.phone.errorRule === PHONE">Ce numéro ne semble pas valide.</span>
<span if="contact.phone.errorRule === PHONE_COUNTRY">Ajoutez l’indicatif du pays, par ex. +33.</span>
```

On a phone field, branch on both `PHONE` and `PHONE_COUNTRY` (or show `{field.error}` unconditionally). While the visitor types a local number with no default country, the rule flips from `PHONE` (up to 5 digits) to `PHONE_COUNTRY` (from 6) — this is expected, not a bug.

Never test `error` text (`if="contact.email.error === '…'"`); branch on `errorRule`. Write `REQUIRED` copy that still reads correctly while the field holds text (see `rich-forms.md` §3).

## `getFormSummary` (bookings / participant fields)

`validateFormSummaryField` uses the same English validation patterns. That path is separate from the page `wixForm` UI; bookings integration is covered by the setup guide (`wix-forms-setup.md`) shipped in the `@jay-framework/wix-forms` package.

## Agent checklist

- **Change a field label** → Wix dashboard (see `agent-kit/references/wix-forms/wix-forms-dashboard-content.md`), keep `{key.field.label}` bindings.
- **Change thank-you / success text** → jay-html under `if="key.submitState === SUCCEEDED"`.
- **Change or translate a submit error** → jay-html branches on `key.submitFailure`; never match on `statusMessage` text.
- **Change or translate a field error** → jay-html branches on `key.<target>.errorRule`; never match on `error` text.
- **Change submit button text** → jay-html button content, not Wix.
- **Do not** hard-code field labels in jay-html when they should stay dashboard-managed.
