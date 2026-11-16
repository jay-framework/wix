// The DL #52 "Country map provenance" match rule, shared by the L-drift probe and unit test A2.
// Pure: no network, no file access.

/** `parseTemplates` input shape: the List Form Templates body. Returns templates by name. */
export function layoutsByTemplateName(templatesBody, templateIds) {
  const byId = new Map();
  for (const template of templatesBody.templates ?? []) {
    const complete = (template.formFields ?? []).every((field) => field.inputOptions?.target);
    if (complete && !byId.has(template.id)) byId.set(template.id, template);
  }
  return Object.fromEntries(
    Object.entries(templateIds).map(([name, id]) => [name, layoutSignature(byId.get(id))]),
  );
}

/** Shown parts minus addressLine2 (the probe form makes every shown part required). */
function layoutSignature(template) {
  if (!template) return undefined;
  const fields = template.formFields;
  const shown = fields.filter((field) => !field.hidden).map((field) => field.inputOptions.target);
  const subdivision = fields.find((field) => field.inputOptions.target === 'subdivision');
  const enumValues = subdivision?.inputOptions.stringOptions?.validation?.enum ?? [];
  return {
    requiredParts: shown.filter((part) => part !== 'addressLine2').sort(),
    hasSubdivision: Boolean(subdivision),
    enumValues: [...enumValues].sort(),
  };
}

/**
 * The templates a probe signature matches. Exactly one name is a match; zero or several
 * is "unmatched or ambiguous", which the plugin fails closed on.
 */
export function matchSignature(signature, layouts) {
  const sameList = (first, second) =>
    first.length === second.length && first.every((value, index) => value === second[index]);
  const byParts = Object.entries(layouts).filter(
    ([, layout]) => layout && sameList(layout.requiredParts, signature.requiredParts),
  );
  if (signature.subdivision === 'NONE') {
    return byParts.filter(([, layout]) => !layout.hasSubdivision).map(([name]) => name);
  }
  if (signature.subdivision !== 'LISTED') return [];
  const allowed = [...(signature.allowedValues ?? [])].sort();
  const exact = byParts.filter(
    ([, layout]) => layout.enumValues.length > 0 && sameList(layout.enumValues, allowed),
  );
  if (exact.length) return exact.map(([name]) => name);
  return byParts
    .filter(([, layout]) => layout.hasSubdivision && layout.enumValues.length === 0)
    .map(([name]) => name);
}

/** A probe pair's signature: the required parts, and whether (and how) subdivision exists. */
export function signatureOf(target, onlyCountryErrors, withSubdivisionErrors) {
  const prefix = `${target}/`;
  const requiredParts = onlyCountryErrors
    .filter((error) => error.errorType === 'REQUIRED_VALUE_ERROR')
    .map((error) => String(error.errorPath).slice(prefix.length))
    .sort();
  const subdivision = withSubdivisionErrors.find(
    (error) => error.errorPath === `${prefix}subdivision`,
  );
  if (subdivision?.errorType === 'UNKNOWN_VALUE_ERROR')
    return { requiredParts, subdivision: 'NONE' };
  if (subdivision?.errorType === 'NOT_ALLOWED_VALUE_ERROR') {
    const allowedValues = [...(subdivision.params?.allowedValues ?? [])].sort();
    return { requiredParts, subdivision: 'LISTED', allowedValues };
  }
  return { requiredParts, subdivision: subdivision?.errorType ?? 'UNOBSERVED' };
}
