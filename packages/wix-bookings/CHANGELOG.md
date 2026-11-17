# Changelog — @jay-framework/wix-bookings

## Unreleased

### Breaking

1. **Booking pages must add the address markup** (see `wix-bookings-setup.md` → Address). A
   participant form with a Multi-line address (the default booking form has a required one) now
   renders through the new `address` tag of `booking-flow` instead of disabling booking with
   `FORM_UNSUPPORTED`. A page without the address inputs cannot book such a service, so the new
   `wix-bookings-address-bindings` validator **errors** on a `booking-flow` page with no address refs
   when `services.yaml` says a service asks for an address (`BOOKINGS-ADDRESS-UNBOUND`; a warning when
   it cannot tell). A page that only offers address-free services can suppress it with
   `wix-bookings: { allow-unbound-address: true }` in its jay-validations block.
2. **`ParticipantFormValue` now includes an address object** (`string | boolean | AddressValue`);
   `createBooking`'s `invalid` outcome may carry `<target>/<part>` keys, `fieldOptions`,
   `revealedParts` and `factsCountry`.
3. **Requires the `@jay-framework/wix-forms` release that ships address fields** (release both packages together).

### Behaviour changes

- **Participant phones are sent as E.164** (DL #58, kept on the Get Form path): checked with the
  `wixForm` phone rules in the browser and in `createBooking`; a local number uses the Phone
  field's default country, else `defaultPhoneCountry`; with neither it is refused with "Please
  include the country code, starting with +.".

### Features

- `createBooking` returns a Create Booking 400 with form violations as `invalid` (located part
  errors) instead of an `UNKNOWN` failure.
- `services.yaml` gains `participantFormHasAddress` per service.

### Fixes

- **A participant phone field made through the Form Schemas API was unsupported.** A
  `TEXT_INPUT` field with format `PHONE` is now a `PHONE` participant field (phone checks, E.164,
  config `defaultPhoneCountry`), so a required one no longer disables booking with
  `FORM_UNSUPPORTED` (wix-forms DL #51 addendum).
