import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { WIX_MEMBERS_CONTEXT as MEMBERS } from '@jay-framework/wix-members';

function Interactive(props, refs, members) {
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
    .withContexts(MEMBERS)
    .withInteractive(Interactive);
