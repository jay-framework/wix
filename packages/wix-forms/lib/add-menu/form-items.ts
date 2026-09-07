/**
 * AIditor Add Menu items — one per site form (Design Log #32, auto-fetch revision).
 */

import type { SiteFormEntry } from '../site-forms-catalog.js';
import { materializedContractPathForEntry } from '../site-forms-catalog.js';

export interface FormAddMenuItem {
    id: string;
    title: string;
    category: string;
    subCategory: string;
    pluginName: string;
    packageName: string;
    thumbnail: string;
    interaction: {
        mode: 'stage-place';
        stagePromptTemplate: string;
    };
    prompt: string;
}

function scriptKeyForForm(entry: SiteFormEntry): string {
    const base = entry.contractSlug.replace(/-form$/, '') || entry.contractSlug;
    return base.replace(/-/g, '');
}

function buildFormJayHtml(entry: SiteFormEntry, scriptKey: string): string {
    return [
        `<script type="application/jay-headless"`,
        `  plugin="@jay-framework/wix-forms"`,
        `  contract="form/${entry.contractSlug}"`,
        `  key="${scriptKey}">`,
        `</script>`,
        ``,
        `<jay:${scriptKey}-form>`,
        `  <p if="${scriptKey}.isLoading">Loading form…</p>`,
        `  <p if="${scriptKey}.loadError" class="form-status error">{${scriptKey}.loadError}</p>`,
        `  <form if="${scriptKey}.fields.length" class="contact-form">`,
        `    <div forEach="${scriptKey}.fields" trackBy="target" class="field-group">`,
        `      <label class="field-label">{field.label}</label>`,
        `      <input if="!field.isTextarea && !field.hasOptions"`,
        `        class="field-input" ref="field.formInputs" type="{field.inputType}"`,
        `        placeholder="{field.placeholder}" />`,
        `      <textarea if="field.isTextarea" class="field-textarea"`,
        `        ref="field.formTextareas" placeholder="{field.placeholder}"></textarea>`,
        `      <select if="field.hasOptions" class="field-select" ref="field.formSelects">`,
        `        <option forEach="${scriptKey}.options" trackBy="id"`,
        `          if="option.fieldTarget === field.target"`,
        `          value="{option.value}">{option.label}</option>`,
        `      </select>`,
        `    </div>`,
        `    <p class="form-status" if="${scriptKey}.statusMessage">{${scriptKey}.statusMessage}</p>`,
        `    <div forEach="${scriptKey}.fieldErrors" trackBy="target" if="${scriptKey}.fieldErrors.length">`,
        `      <p class="form-status error">{error.errorMessage}</p>`,
        `    </div>`,
        `    <button class="submit-button" ref="${scriptKey}.submitButton"`,
        `      disabled="{${scriptKey}.isSubmitting}">`,
        `      {${scriptKey}.isSubmitting ? 'Sending…' : 'Send message'}`,
        `    </button>`,
        `  </form>`,
        `</jay:${scriptKey}-form>`,
    ].join('\n');
}

export function buildFormAddMenuItems(entries: SiteFormEntry[]): FormAddMenuItem[] {
    return entries.map((entry) => {
        const scriptKey = scriptKeyForForm(entry);
        const contractPath = materializedContractPathForEntry(entry);
        const jayHtml = buildFormJayHtml(entry, scriptKey);

        return {
            id: `wix-forms:form:${entry.formId}`,
            title: entry.title,
            category: 'Forms',
            subCategory: 'Site forms',
            pluginName: 'wix-forms',
            packageName: '@jay-framework/wix-forms',
            thumbnail: 'thumbnails/wix-forms/form.svg',
            interaction: {
                mode: 'stage-place',
                stagePromptTemplate: `Add the "${entry.title}" Wix form at this marker with working inputs and submit.`,
            },
            prompt: [
                `Add the Wix form "${entry.title}" at the marker location.`,
                '',
                'Form facts (from site API — no manual config):',
                `  formId: ${entry.formId}`,
                `  contract: form/${entry.contractSlug}`,
                `  materialized contract: ${contractPath}`,
                `  script key: ${scriptKey}`,
                '',
                'Read the materialized contract for fieldCatalog targets before binding.',
                'Use forEach on fields/options — not top-level per-field tags.',
                'Submit uses the wixForm headless component (submitForm action) via refs.submitButton.',
                '',
                'Add this jay-html at the marker (adjust classes to match the page):',
                '```html',
                jayHtml,
                '```',
            ].join('\n'),
        };
    });
}
