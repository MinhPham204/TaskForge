import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuFileText, LuPlus, LuTrash2, LuCalendar, LuClock, LuTriangleAlert, LuArrowRight } from 'react-icons/lu';
import Modal from '../../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../../components/common/PageState';
import { useGetProjectDocumentsQuery, useArchiveProjectDocumentMutation, useGetProjectModulesQuery } from '../../../services/projectApi';

const ProjectDocumentsTab = ({ projectId, canManage = false }) => {
  const navigate = useNavigate();
  const { data: documents = [], isLoading, isError, error, refetch } = useGetProjectDocumentsQuery(projectId);
  const { data: modules = [] } = useGetProjectModulesQuery(projectId);
  const [archiveDocument, { isLoading: isArchiving }] = useArchiveProjectDocumentMutation();
  const [docToArchive, setDocToArchive] = useState(null);
  const [archiveError, setArchiveError] = useState('');

  const isDocumentsModuleEnabled = Boolean(modules.find((module) => module.moduleCode === 'DOCUMENTS')?.enabled);
  const openNewDocument = () => navigate(`/projects/${projectId}/documents/new`);
  const openDocument = (documentId) => navigate(`/projects/${projectId}/documents/${documentId}`);

  const handleConfirmArchive = async () => {
    if (!docToArchive) return;
    setArchiveError('');
    try {
      await archiveDocument({ projectId, documentId: docToArchive.id }).unwrap();
      setDocToArchive(null);
    } catch (err) {
      setArchiveError(err?.data?.message || err?.message || 'Failed to archive document');
    }
  };

  return (
    <div className="space-y-6">
      {!isDocumentsModuleEnabled && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <LuTriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800"><p className="font-semibold">Documents module is disabled</p><p className="mt-1">Existing wiki pages remain readable. Enable the module before creating or editing pages.</p></div>
        </div>
      )}

      <div className="flex flex-col justify-between gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-xs sm:flex-row sm:items-center">
        <div><h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><LuFileText className="h-5 w-5 text-primary" />Project Wiki</h2><p className="mt-0.5 text-xs text-gray-500">A shared home for specifications, decisions, runbooks, and team knowledge.</p></div>
        {canManage && isDocumentsModuleEnabled && <button type="button" onClick={openNewDocument} className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700 sm:self-auto"><LuPlus className="h-4 w-4" />New wiki page</button>}
      </div>

      {isLoading ? <LoadingState message="Loading wiki pages..." /> : isError ? <ErrorState title="Failed to load wiki pages" message={error?.data?.message || 'Could not fetch project documentation.'} onRetry={refetch} /> : documents.length === 0 ? (
        <EmptyState icon={LuFileText} title="No wiki pages yet" description={isDocumentsModuleEnabled ? 'Start documenting the decisions and working agreements that keep this project moving.' : 'No project documentation exists yet.'} actionLabel={canManage && isDocumentsModuleEnabled ? 'Create wiki page' : null} onAction={canManage && isDocumentsModuleEnabled ? openNewDocument : null} />
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {documents.map((document) => <div key={document.id} className="flex items-center gap-3 p-4 transition-colors hover:bg-gray-50/70"><LuFileText className="h-5 w-5 shrink-0 text-primary" /><button type="button" onClick={() => openDocument(document.id)} className="min-w-0 flex-1 text-left focus:outline-none focus:ring-2 focus:ring-primary/30"><p className="truncate text-sm font-semibold text-gray-900 hover:text-primary">{document.title}</p><p className="mt-1 line-clamp-1 text-xs text-gray-500">{document.content}</p><p className="mt-2 flex items-center gap-3 text-[11px] text-gray-400"><span className="inline-flex items-center gap-1"><LuCalendar className="h-3 w-3" />Created {new Date(document.createdAt).toLocaleDateString()}</span><span className="inline-flex items-center gap-1"><LuClock className="h-3 w-3" />Updated {new Date(document.updatedAt).toLocaleDateString()}</span></p></button><button type="button" onClick={() => openDocument(document.id)} aria-label={`Open ${document.title}`} className="rounded-md p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"><LuArrowRight className="h-4 w-4" /></button>{canManage && <button type="button" onClick={() => { setArchiveError(''); setDocToArchive(document); }} aria-label={`Archive ${document.title}`} className="rounded-md p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"><LuTrash2 className="h-4 w-4" /></button>}</div>)}
        </div>
      )}

      <Modal isOpen={Boolean(docToArchive)} onClose={() => !isArchiving && setDocToArchive(null)} title="Archive wiki page"><div className="space-y-4">{archiveError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{archiveError}</div>}<p className="text-sm leading-relaxed text-gray-600">Archive <strong className="text-gray-900">{docToArchive?.title}</strong>? It will be removed from the active wiki.</p><div className="flex justify-end gap-2 border-t border-gray-100 pt-4"><button type="button" onClick={() => setDocToArchive(null)} disabled={isArchiving} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button><button type="button" onClick={handleConfirmArchive} disabled={isArchiving} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">{isArchiving ? 'Archiving...' : 'Archive page'}</button></div></div></Modal>
    </div>
  );
};

export default ProjectDocumentsTab;
