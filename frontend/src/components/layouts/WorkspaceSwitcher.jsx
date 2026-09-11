import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectActiveOrganizationId,
  selectIsOrganizationsLoading,
  selectOrganizations,
  switchOrganization,
} from '../../store/authSlice.js';

const WorkspaceSwitcher = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const organizations = useSelector(selectOrganizations);
  const activeOrganizationId = useSelector(selectActiveOrganizationId);
  const isLoading = useSelector(selectIsOrganizationsLoading);

  if (!organizations.length) {
    return null;
  }

  const handleChange = (event) => {
    const val = event.target.value;
    if (val === '__create_new__') {
      navigate('/workspace/onboarding');
      return;
    }
    dispatch(switchOrganization(val));
  };

  return (
    <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
      <span className="hidden sm:inline">Workspace</span>
      <select
        aria-label="Active workspace"
        className="max-w-52 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
        value={activeOrganizationId || ''}
        disabled={isLoading}
        onChange={handleChange}
      >
        {organizations.map((organization) => (
          <option key={organization.organizationId} value={organization.organizationId}>
            {organization.name}
          </option>
        ))}
        <option value="__create_new__">+ New Workspace...</option>
      </select>
    </label>
  );
};

export default WorkspaceSwitcher;
