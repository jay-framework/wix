import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { WIX_MEMBERS_CONTEXT } from '@jay-framework/wix-members/client';

function Interactive(props, refs, members) {
    refs.form.onsubmit(({ event }) => {
        event.preventDefault();
        const email = '';
        const password = '';
        members.login(email, password);
        members.register(email, password);
    });
    return { render: () => ({}) };
}

export const page = makeJayStackComponent()
    .withProps()
    .withContexts(WIX_MEMBERS_CONTEXT)
    .withInteractive(Interactive);
