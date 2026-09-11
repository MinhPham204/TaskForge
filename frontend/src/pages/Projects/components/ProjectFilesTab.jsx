import React, { useState } from 'react';
import {
  LuFileText,
  LuUpload,
  LuDownload,
  LuTrash2,
  LuTriangleAlert,
  LuPlus,
  LuRotateCcw,
  LuLock,
  LuFile,
  LuImage,
} from 'react-icons/lu';
import Modal from '../../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../../components/common/PageState';
import {
  useGetProjectFilesQuery,
  useUploadProjectFileMutation,
  useRemoveProjectFileMutation,
  downloadProjectFile,
} from '../../../services/collaborationApi';
import { useGetProjectModulesQuery } from '../../../services/projectApi';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'];

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (mediaType) => {
  if (mediaType?.startsWith('image/')) return LuImage;
  return LuFileText;
};

const ProjectFilesTab = ({ projectId, canManage = false }) => {
  // Query project files
  const {
    data: files = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectFilesQuery(projectId);

  // Query project modules to check if FILES module is enabled
  const { data: modules = [] } = useGetProjectModulesQuery(projectId);
  const filesModuleSetting = modules.find((m) => m.moduleCode === 'FILES');
  const isFilesModuleEnabled = Boolean(filesModuleSetting?.enabled);

  // Mutations
  const [uploadFile, { isLoading: isUploading }] = useUploadProjectFileMutation();
  const [removeFile, { isLoading: isRemoving }] = useRemoveProjectFileMutation();

  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Unlink Confirmation State
  const [fileToUnlink, setFileToUnlink] = useState(null);
  const [unlinkError, setUnlinkError] = useState('');

  // Download state
  const [downloadingId, setDownloadingId] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setUploadError('');
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Only PDF, JPEG, PNG, or plain text files are permitted.');
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError('File exceeds the 10 MiB limit.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    if (!displayName) {
      setDisplayName(file.name);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a file to upload.');
      return;
    }
    setUploadError('');

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (displayName.trim()) {
      formData.append('displayName', displayName.trim());
    }

    try {
      await uploadFile({ projectId, formData }).unwrap();
      setIsUploadOpen(false);
      setSelectedFile(null);
      setDisplayName('');
    } catch (err) {
      setUploadError(
        err.data?.message || err.message || 'Failed to upload project file. Please try again.',
      );
    }
  };

  const handleDownload = async (file) => {
    try {
      setDownloadingId(file.id);
      await downloadProjectFile(
        projectId,
        file.id,
        file.displayName || file.originalName || 'file',
      );
    } catch (err) {
      // In case download fails
      console.error('Download failed', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleConfirmUnlink = async () => {
    if (!fileToUnlink) return;
    setUnlinkError('');
    try {
      await removeFile({ projectId, fileId: fileToUnlink.id }).unwrap();
      setFileToUnlink(null);
    } catch (err) {
      setUnlinkError(
        err.data?.message || err.message || 'Failed to remove project file.',
      );
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading project files..." />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to Load Files"
        message={error?.data?.message || 'Could not retrieve project files.'}
        onRetry={refetch}
      />
    );
  }

  const canUpload = canManage && isFilesModuleEnabled;

  return (
    <div className="space-y-4">
      {/* Module Disabled Notice */}
      {!isFilesModuleEnabled && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 shadow-xs"
        >
          <LuLock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">Project Files module is currently disabled.</span>
            <p className="text-amber-700">
              New files cannot be uploaded to this project. Existing project files remain available for viewing, download, and management.
            </p>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <LuFileText className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-gray-900">Project Files</h2>
          <span className="text-xs text-gray-500 font-normal">
            ({files.length} {files.length === 1 ? 'file' : 'files'})
          </span>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <LuRotateCcw className="w-3.5 h-3.5" />
            Refresh
          </button>

          {canManage && (
            <button
              type="button"
              disabled={!canUpload}
              onClick={() => {
                setUploadError('');
                setSelectedFile(null);
                setDisplayName('');
                setIsUploadOpen(true);
              }}
              title={
                !isFilesModuleEnabled
                  ? 'FILES module is disabled'
                  : 'Upload file to project'
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs transition-colors"
            >
              <LuPlus className="w-4 h-4" />
              Upload File
            </button>
          )}
        </div>
      </div>

      {/* Files List / Table */}
      {files.length === 0 ? (
        <EmptyState
          title="No Project Files"
          message={
            canUpload
              ? 'No files have been added to this project yet. Click "Upload File" to share documents with your team.'
              : 'No files have been added to this project.'
          }
          icon={LuFile}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-gray-200">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="py-3 px-4 font-semibold">Name / Document</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 font-semibold">Size</th>
                  <th className="py-3 px-4 font-semibold">Uploaded</th>
                  <th className="py-3 px-4 font-semibold">Uploader</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {files.map((file) => {
                  const Icon = getFileIcon(file.mediaType);
                  return (
                    <tr key={file.id} className="hover:bg-gray-50/75 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-blue-50 text-primary shrink-0">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate max-w-xs sm:max-w-md">
                              {file.displayName || file.originalName}
                            </p>
                            {file.displayName && file.displayName !== file.originalName && (
                              <p className="text-[11px] text-gray-400 truncate max-w-xs">
                                {file.originalName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600 font-mono text-[11px]">
                        {file.mediaType?.split('/')[1]?.toUpperCase() || 'FILE'}
                      </td>
                      <td className="py-3 px-4 text-gray-600 font-mono text-[11px]">
                        {formatBytes(file.sizeBytes)}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-[11px]">
                        {new Date(file.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {file.uploaderName || 'Project Member'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDownload(file)}
                            disabled={downloadingId === file.id}
                            aria-label={`Download ${file.displayName || file.originalName}`}
                            title="Download file"
                            className="p-1.5 text-gray-600 hover:text-primary rounded-md hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <LuDownload className="w-4 h-4" />
                          </button>

                          {canManage && (
                            <button
                              type="button"
                              onClick={() => {
                                setUnlinkError('');
                                setFileToUnlink(file);
                              }}
                              aria-label={`Remove ${file.displayName || file.originalName}`}
                              title="Remove file from project"
                              className="p-1.5 text-gray-600 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <LuTrash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload File Modal */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => !isUploading && setIsUploadOpen(false)}
        title="Upload Project File"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {uploadError && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2"
            >
              <LuTriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Select File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              onChange={handleFileChange}
              disabled={isUploading}
              className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 file:cursor-pointer border border-gray-300 rounded-lg p-1.5"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Supported types: PDF, PNG, JPEG, TXT (Maximum: 10 MiB)
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Display Name (Optional)
            </label>
            <input
              type="text"
              maxLength={255}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Q3 Architecture Spec"
              disabled={isUploading}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsUploadOpen(false)}
              disabled={isUploading}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <LuUpload className="w-3.5 h-3.5" />
                  <span>Upload</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Unlink Accessible Confirmation Modal */}
      <Modal
        isOpen={Boolean(fileToUnlink)}
        onClose={() => !isRemoving && setFileToUnlink(null)}
        title="Remove Project File"
      >
        <div className="space-y-4">
          {unlinkError && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg"
            >
              {unlinkError}
            </div>
          )}

          <p className="text-xs text-gray-600 leading-relaxed">
            Are you sure you want to remove <strong>{fileToUnlink?.displayName || fileToUnlink?.originalName}</strong> from this project? This will soft-remove the file relation from the project.
          </p>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setFileToUnlink(null)}
              disabled={isRemoving}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmUnlink}
              disabled={isRemoving}
              className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isRemoving ? 'Removing...' : 'Confirm Remove'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectFilesTab;
