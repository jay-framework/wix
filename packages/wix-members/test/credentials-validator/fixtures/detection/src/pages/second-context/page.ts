import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { WIX_MEMBERS_CONTEXT } from '@jay-framework/wix-members/client';
import { OTHER_CONTEXT } from './other';
function Interactive(props, refs, other, members) {
    refs.form.onsubmit(({ event }) => {
        event.preventDefault();
        const email = '';
        const password = '';
        members.register(email, password);
    });
    return { render: () => ({}) };
}

export const page = makeJayStackComponent()
    .withProps()
    .withContexts(OTHER_CONTEXT, WIX_MEMBERS_CONTEXT)
    .withInteractive(Interactive);
