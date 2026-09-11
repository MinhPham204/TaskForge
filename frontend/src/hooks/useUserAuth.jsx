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
} from "../store/authSlice";

const useUserAuth = () => {
  const auth = useSelector((state) => state.auth);
  const role = useSelector(selectRole);
  const organizationId = useSelector(selectOrganizationId);
  const activeOrganization = useSelector(selectActiveOrganization);
  const activeOrganizationId = useSelector(selectActiveOrganizationId);
  const organizations = useSelector(selectOrganizations);
  const isOrganizationsLoading = useSelector(selectIsOrganizationsLoading);
  const organizationsInitialized = useSelector(selectOrganizationsInitialized);

  return {
    ...auth,
    role,
    organizationId,
    activeOrganization,
    activeOrganizationId,
    organizations,
    isOrganizationsLoading,
    organizationsInitialized,
  };
};

export default useUserAuth;
