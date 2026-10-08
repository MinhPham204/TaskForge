// hooks/useUserAuth.js
import { useSelector } from "react-redux";
import {
  selectRole,
  selectOrganizationId,
  selectActiveOrganization,
  selectActiveOrganizationId,
  selectOrganizations,
  selectIsOrganizationsLoading,
  selectOrganizationsInitialized,
  selectOrganizationCapabilities,
} from "../store/authSlice";
import { useGetMyOrganizationPermissionsQuery } from '../services/organizationApi.js';
import { hasOrganizationPermission } from '../utils/organizationPermissions.js';

const useUserAuth = () => {
  const auth = useSelector((state) => state.auth);
  const role = useSelector(selectRole);
  const organizationId = useSelector(selectOrganizationId);
  const activeOrganization = useSelector(selectActiveOrganization);
  const activeOrganizationId = useSelector(selectActiveOrganizationId);
  const organizations = useSelector(selectOrganizations);
  const isOrganizationsLoading = useSelector(selectIsOrganizationsLoading);
  const organizationsInitialized = useSelector(selectOrganizationsInitialized);
  const capabilities = useSelector(selectOrganizationCapabilities);
  const capabilityQuery = useGetMyOrganizationPermissionsQuery(
    { userId: auth.user?.id, organizationId: activeOrganizationId },
    { skip: !auth.user?.id || !activeOrganizationId, refetchOnMountOrArgChange: true, refetchOnFocus: true, refetchOnReconnect: true },
  );

  return {
    ...auth,
    role,
    organizationId,
    activeOrganization,
    activeOrganizationId,
    organizations,
    isOrganizationsLoading,
    organizationsInitialized,
    capabilities,
    roleSummary: capabilities?.role || null,
    isOwner: capabilities?.isOwner === true,
    permissions: capabilities?.permissions || [],
    hasPermission: (code) => hasOrganizationPermission(capabilities, code),
    isPermissionsLoading: capabilityQuery.isLoading || capabilityQuery.isFetching,
    permissionsError: capabilityQuery.error,
    refreshPermissions: capabilityQuery.refetch,
  };
};

export default useUserAuth;
