import type { WixClient } from '@wix/sdk';
import { queryAllPages } from './query-all-pages.js';
import { queryStaffMembers } from './query-staff-members.js';

/**
 * The resource type id of the site's staff: the `typeId` of a staff member's resource.
 * (`/bookings/v2/resources/resource-types/query` returned an empty list on a fresh site, so
 * the type is read from an actual staff resource.) Undefined when the site has no staff.
 */
export async function discoverStaffResourceTypeId(client: WixClient): Promise<string | undefined> {
    const staffMembers = await queryStaffMembers(client);
    const staffResourceIds = new Set(staffMembers.map((member) => member.resourceId));
    if (!staffResourceIds.size) return undefined;

    const resources = await queryAllPages<'resources', { id?: string; typeId?: string }>(
        client,
        '/bookings/v2/resources/query',
        'resources',
    );
    return resources.find((resource) => resource.id && staffResourceIds.has(resource.id))?.typeId;
}
