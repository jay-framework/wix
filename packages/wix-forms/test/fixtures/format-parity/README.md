# Format parity fixtures (DL#55)

- `wix-l1-probes-2026-11-11.json` — the L1 live capture against the QA testbed site, verbatim except
  that `submitter.applicationId`, the submission ids and the probe email are redacted to
  `<application-id>`, `<submission-id-N>` and `<probe-email>`. Its `method` text ("every case
  includes a deliberately invalid sibling so nothing is stored") predates the clean probes: it is
  false for `results` "required: all omitted" and `cleanProbes[0]`, which were stored.
- `wix-l1b-probes-2026-11-11.json` — the L1b capture (same method and redaction).
- `qa-test-dl54-fields.json` — hand-written `FormFieldView`s of the probed form "QA Test DL54".

The format probes are the oracle of `test/format-parity.test.ts`. Re-run the probes when a block is
reported: Wix publishes no format rules, so these files are a dated snapshot.

## DL#55 P1c captures (2026-11-12, QA testbed)

- `wix-caller-path-phone-2026-11-12.json` — L7/L8 caller-path phone rows: direct Create Submission
  posts with visitor tokens, and the plugin in a real browser (`sent` = the posted value, `stored` =
  REST read-back). Each row records the `rules` (`PhoneRules`) it was captured under. Built by a
  script from the raw captures; submission ids, application ids and visitor/contact ids redacted.
- `phone-input-field-schema.json` — Get Form of "QA DL55 Phone", a real Wix Phone field
  (`CONTACTS_PHONE` / `PHONE_INPUT`, default country IL, accepted IL + US), verbatim (nothing to
  redact). The plugin reads the legacy `fields[]`: `view.defaultCountry` and
  `validation.string.phoneOptions.allowedCountryCodes`.
