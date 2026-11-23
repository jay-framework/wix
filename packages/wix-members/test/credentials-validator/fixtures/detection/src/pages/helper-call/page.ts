import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { WIX_MEMBERS_CONTEXT } from '@jay-framework/wix-members/client';
import { signUp } from './sign-up';
function Interactive(props, refs, members) {
    refs.form.onsubmit(({ event }) => {
        event.preventDefault();
        const email = '';
        const password = '';
        signUp(email, members);

    });
    return { render: () => ({}) };
}

export const page = makeJayStackComponent()
    .withProps()
    .withContexts(WIX_MEMBERS_CONTEXT)
    .withInteractive(Interactive);
