/**
 * wix-bookings plugin validator (DL #52 §6): the participant address on `booking-flow` pages.
 *
 *  - A page that binds address refs must bind every part's input(s), and no unknown part or
 *    child (the wix-forms rule 6 core, `checkAddressBindings`): core grafts unknown `ref=`
 *    sub-tags silently, so this is the only build-time guard.
 *  - A page that binds no address ref (`BOOKINGS-ADDRESS-UNBOUND`): an error when a site service's
 *    participant form has an address (agent-kit `services.yaml`), nothing when none has one, a
 *    warning when it cannot be known. A page silences only this finding with
 *    `wix-bookings: { allow-unbound-address: true }` in its jay-validations block.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';
import { checkAddressBindings } from '@jay-framework/wix-forms/tools';

const BOOKING_FLOW_CONTRACT = 'booking-flow';
const PLUGIN_KEY = 'wix-bookings';
const SUPPRESSION_KEY = 'allow-unbound-address';
export const UNBOUND_ADDRESS_CODE = 'BOOKINGS-ADDRESS-UNBOUND';
const SERVICES_REFERENCE = path.join('agent-kit', 'references', 'wix-bookings', 'services.yaml');

const SUPPRESSION_HINT =
    `A page that only offers address-free services can add <script type="application/jay-validations">` +
    `${PLUGIN_KEY}: { ${SUPPRESSION_KEY}: true }</script>.`;

export const validateBookingFlowBindings: JayHtmlValidatorFn = (ctx) => {
    const keys = ctx.headlessImports
        .filter((imp) => imp.key && imp.contractName === BOOKING_FLOW_CONTRACT)
        .map((imp) => imp.key!);
    if (!keys.length) return [];
    const refs = collectRefs(ctx);
    const findings: JayHtmlValidationFinding[] = [];
    for (const key of keys) {
        const prefix = `${key}.address`;
        if (refs.some((ref) => ref.startsWith(`${prefix}.`))) {
            findings.push(...checkAddressBindings(refs, prefix));
        } else if (!isSuppressed(ctx)) {
            findings.push(...unboundAddressFindings(ctx.projectRoot, key));
        }
    }
    return findings;
};

function isSuppressed(ctx: Parameters<JayHtmlValidatorFn>[0]): boolean {
    return ctx.validationOverrides?.[PLUGIN_KEY]?.[SUPPRESSION_KEY] === true;
}

interface ServiceEntry {
    name?: string;
    participantFormHasAddress?: boolean;
}

function unboundAddressFindings(projectRoot: string, key: string): JayHtmlValidationFinding[] {
    const services = readServices(projectRoot);
    const withAddress =
        services?.filter((service) => service.participantFormHasAddress === true) ?? [];
    if (withAddress.length) {
        const names = withAddress.map((service) => service.name || '(unnamed)').join(', ');
        return [
            {
                severity: 'error',
                message: `${UNBOUND_ADDRESS_CODE}: Service ${names} asks for an address, but this booking-flow page binds no address inputs. Add the address markup (wix-bookings-setup.md → Address).`,
                suggestion: `Bind ref="${key}.address.<part>.input" for every part (see the ✅ example in wix-bookings-setup.md). ${SUPPRESSION_HINT}`,
                attribute: 'ref',
            },
        ];
    }
    const isKnown =
        services !== undefined &&
        services.every((service) => typeof service.participantFormHasAddress === 'boolean');
    if (isKnown) return [];
    return [
        {
            severity: 'warning',
            message: `${UNBOUND_ADDRESS_CODE}: Cannot tell whether any service asks for an address; run \`jay-stack agent-kit\` to refresh services.yaml.`,
            suggestion: `If a service asks for one, bind the address parts under "${key}.address". ${SUPPRESSION_HINT}`,
        },
    ];
}

/** undefined when the reference is missing or unreadable. */
function readServices(projectRoot: string): ServiceEntry[] | undefined {
    try {
        const file = path.join(projectRoot, SERVICES_REFERENCE);
        const parsed = yaml.load(fs.readFileSync(file, 'utf8')) as {
            services?: ServiceEntry[];
        } | null;
        return Array.isArray(parsed?.services) ? parsed!.services : undefined;
    } catch {
        return undefined;
    }
}

function collectRefs(ctx: Parameters<JayHtmlValidatorFn>[0]): string[] {
    const refs: string[] = [];
    walkElements(ctx.body, ctx, (el: any) => {
        const ref: string | undefined = el?.getAttribute?.('ref');
        if (ref) refs.push(ref);
    });
    return refs;
}
