import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { PageContract } from './page.jay-contract';

/** Shows the reference and caller type the submit hook put in its `redirectTo` (DL#40 demo). */
export const page = makeJayStackComponent<PageContract>()
    .withProps()
    .withFastRender(async (props) =>
        phaseOutput(
            {
                reference: props.query.ref ?? '',
                callerType: props.query.caller ?? 'NONE',
            },
            {},
        ),
    );
