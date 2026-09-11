import React from 'react';
import {
  LuFlag,
  LuFileText,
  LuFolder,
  LuOctagonAlert,
  LuLayers,
  LuLock,
} from 'react-icons/lu';
import { useSetProjectModuleMutation } from '../../../services/projectApi';
import { useGetProjectModulesQuery } from '../../../services/projectApi';

const moduleMeta = {
  MILESTONES: {
    name: 'Milestones',
    desc: 'Track major project checkpoints, delivery target dates, and phase gates.',
    icon: LuFlag,
  },
  DOCUMENTS: {
    name: 'Documents',
    desc: 'Project specifications, architecture docs, and persistent notes.',
    icon: LuFileText,
  },
  FILES: {
    name: 'Files & Storage',
    desc: 'Upload, manage, and share project assets and deliverable attachments.',
    icon: LuFolder,
  },
  RISKS: {
    name: 'Risk Management',
    desc: 'Identify, categorize, and track mitigation for delivery blockers and risks.',
    icon: LuOctagonAlert,
  },
};

const ProjectModulesTab = ({
  projectId,
  canManage,
}) => {
  const { data: projectModules = [], isLoading, isError, error, refetch } = useGetProjectModulesQuery(projectId);
  const [setProjectModule, { isLoading: isSettingModule }] = useSetProjectModuleMutation();

  const handleToggleModule = async (moduleCode, currentEnabled) => {
    if (!canManage || isSettingModule) return;
    try {
      await setProjectModule({
        projectId,
        moduleCode,
        enabled: !currentEnabled,
      }).unwrap();
    } catch (err) {
      alert(err?.data?.message || err?.message || 'Failed to toggle module setting');
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-6 shadow-xs">
      <div className="mb-6 pb-3 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Project Module Settings</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Enable or disable functional extensions for this project. Disabling a module retains all underlying data.
        </p>
      </div>

      {!canManage && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600 flex items-center gap-2">
          <LuLock className="w-4 h-4 text-gray-400 shrink-0" />
          <span>Read-only: Project Manager authorization is required to toggle functional modules.</span>
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading project modules...</p>}
      {isError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <p>{error?.data?.message || 'Unable to load project modules.'}</p>
          <button type="button" onClick={refetch} className="mt-2 font-semibold underline underline-offset-2">Try again</button>
        </div>
      )}
      {!isLoading && !isError && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {projectModules.map((moduleSetting) => {
          const meta = moduleMeta[moduleSetting.moduleCode] || {
            name: moduleSetting.moduleCode,
            desc: 'Project functional extension module.',
            icon: LuLayers,
          };
          const Icon = meta.icon;
          const isEnabled = moduleSetting.enabled;

          return (
            <div
              key={moduleSetting.moduleCode}
              className={`border rounded-lg p-5 transition-all flex flex-col justify-between ${
                isEnabled
                  ? 'border-blue-200 bg-white shadow-xs'
                  : 'border-gray-200 bg-gray-50/50 opacity-80'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isEnabled ? 'bg-blue-50 text-primary' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{meta.name}</h3>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isEnabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      {isEnabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{meta.desc}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {moduleSetting.updatedAt
                    ? `Updated ${new Date(moduleSetting.updatedAt).toLocaleDateString()}`
                    : 'Initialized'}
                </span>

                <button
                  type="button"
                  onClick={() => handleToggleModule(moduleSetting.moduleCode, isEnabled)}
                  disabled={!canManage || isSettingModule}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isEnabled
                      ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                      : 'bg-primary text-white hover:bg-blue-700'
                  }`}
                >
                  {isEnabled ? 'Disable Module' : 'Enable Module'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

export default ProjectModulesTab;
