import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LuArrowLeft, LuBookOpen, LuCheck, LuHeading, LuLink, LuList, LuSave, LuTriangleAlert } from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import { ErrorState, LoadingState } from '../../components/common/PageState';
import {
  useCreateProjectDocumentMutation,
  useGetProjectDocumentByIdQuery,
  useGetProjectByIdQuery,
  useGetProjectModulesQuery,
  useUpdateProjectDocumentMutation,
} from '../../services/projectApi';

const INSERTIONS = [
  { label: 'Heading', icon: LuHeading, text: '## Section heading\n' },
  { label: 'List', icon: LuList, text: '- List item\n' },
  { label: 'Link', icon: LuLink, text: '[Link label](https://) ' },
];

const isBlockStart = (line) => /^(#{1,3}\s|[-*]\s|\d+\.\s|>\s|```|---\s*$)/.test(line);

const renderInline = (text, key) => {
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  const nodes = [];
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    if (match[2]) nodes.push(<a key={`${key}-${match.index}`} href={match[3]} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{match[2]}</a>);
    else if (match[4]) nodes.push(<code key={`${key}-${match.index}`} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800">{match[4]}</code>);
    else if (match[5]) nodes.push(<strong key={`${key}-${match.index}`} className="font-semibold text-gray-900">{match[5]}</strong>);
    else if (match[6]) nodes.push(<em key={`${key}-${match.index}`}>{match[6]}</em>);
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
};

const MarkdownPreview = ({ markdown }) => {
  if (!markdown.trim()) return <span className="text-gray-400">Your rendered preview will appear here.</span>;
  const lines = markdown.split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith('```')) {
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`} className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-6 text-slate-100"><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length}`;
      const styles = { h1: 'text-2xl', h2: 'text-xl', h3: 'text-lg' };
      blocks.push(<Tag key={`heading-${index}`} className={`${styles[Tag]} mt-5 first:mt-0 font-bold text-gray-900`}>{renderInline(heading[2], `heading-${index}`)}</Tag>);
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) items.push(lines[index++].replace(/^[-*]\s+/, ''));
      blocks.push(<ul key={`ul-${index}`} className="my-3 list-disc space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ul-${index}-${itemIndex}`)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) items.push(lines[index++].replace(/^\d+\.\s+/, ''));
      blocks.push(<ol key={`ol-${index}`} className="my-3 list-decimal space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ol-${index}-${itemIndex}`)}</li>)}</ol>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={`quote-${index}`} className="my-3 border-l-4 border-blue-200 pl-4 italic text-gray-600">{renderInline(quote.join('\n'), `quote-${index}`)}</blockquote>);
      continue;
    }
    if (/^---\s*$/.test(line)) { blocks.push(<hr key={`rule-${index++}`} className="my-5 border-gray-200" />); continue; }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`paragraph-${index}`} className="my-3 first:mt-0 whitespace-pre-wrap">{renderInline(paragraph.join('\n'), `paragraph-${index}`)}</p>);
  }
  return blocks;
};

const ProjectDocumentPage = () => {
  const { projectId, documentId } = useParams();
  const navigate = useNavigate();
  const contentRef = useRef(null);
  const splitRef = useRef(null);
  const isNew = documentId === 'new';
  const [splitPercent, setSplitPercent] = useState(50);
  const [isResizing, setIsResizing] = useState(false);

  const { data: project, isLoading: isProjectLoading } = useGetProjectByIdQuery(projectId);
  const { data: modules = [] } = useGetProjectModulesQuery(projectId);
  const { data: document, isLoading: isDocumentLoading, isError, error, refetch } = useGetProjectDocumentByIdQuery({ projectId, documentId }, { skip: isNew });
  const [createDocument, { isLoading: isCreating }] = useCreateProjectDocumentMutation();
  const [updateDocument, { isLoading: isUpdating }] = useUpdateProjectDocumentMutation();
  const [draftTitle, setDraftTitle] = useState(isNew ? '' : null);
  const [draftContent, setDraftContent] = useState(isNew ? '' : null);
  const [saveError, setSaveError] = useState('');

  const canManage = Boolean(project?.viewer?.canManage);
  const isDocumentsModuleEnabled = Boolean(modules.find((module) => module.moduleCode === 'DOCUMENTS')?.enabled);
  const editable = canManage && isDocumentsModuleEnabled;
  const title = draftTitle ?? document?.title ?? '';
  const content = draftContent ?? document?.content ?? '';
  const isSaving = isCreating || isUpdating;

  useEffect(() => {
    if (!isResizing) return undefined;
    const move = (event) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSplitPercent(Math.max(28, Math.min(72, ((event.clientX - rect.left) / rect.width) * 100)));
    };
    const stop = () => setIsResizing(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  }, [isResizing]);

  const insertText = (text) => {
    const textarea = contentRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    setDraftContent(`${content.slice(0, start)}${text}${content.slice(end)}`);
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(start + text.length, start + text.length); });
  };

  const save = async (event) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    if (!normalizedTitle || !normalizedContent) { setSaveError('A wiki page needs both a title and content.'); return; }
    setSaveError('');
    try {
      if (isNew) {
        const created = await createDocument({ projectId, title: normalizedTitle, content: normalizedContent }).unwrap();
        navigate(`/projects/${projectId}/documents/${created.id}`, { replace: true });
      } else {
        await updateDocument({ projectId, documentId, title: normalizedTitle, content: normalizedContent }).unwrap();
        setDraftTitle(null); setDraftContent(null);
      }
    } catch (err) { setSaveError(err?.data?.message || err?.message || 'Unable to save this wiki page.'); }
  };

  if (isProjectLoading || (!isNew && isDocumentLoading)) return <DashboardLayout activeMenu="/projects"><LoadingState message="Loading wiki page..." /></DashboardLayout>;
  if (!isNew && isError) return <DashboardLayout activeMenu="/projects"><ErrorState title="Wiki page not found" message={error?.data?.message || 'This page could not be opened.'} onRetry={refetch} /></DashboardLayout>;

  const editor = <><label htmlFor="wiki-content" className="mb-2 block text-xs font-semibold text-gray-700">Markdown editor</label><textarea ref={contentRef} id="wiki-content" value={content} onChange={(event) => setDraftContent(event.target.value)} disabled={!editable} maxLength={100000} placeholder="## Context\nDocument the decisions and guidance for your team..." className="min-h-[29rem] w-full resize-none rounded-lg border border-gray-200 bg-white p-4 font-mono text-sm leading-7 text-gray-800 placeholder:text-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50" /></>;
  const preview = <><p className="mb-2 text-xs font-semibold text-gray-700">Rendered preview</p><article className="min-h-[29rem] overflow-auto rounded-lg border border-gray-100 bg-white p-5 text-sm leading-7 text-gray-700"><MarkdownPreview markdown={content} /></article></>;

  return <DashboardLayout activeMenu="/projects"><main className="mx-auto w-full max-w-none space-y-3 py-0">
    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><button type="button" onClick={() => navigate(`/projects/${projectId}?tab=documents`)} className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-gray-600 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"><LuArrowLeft className="h-4 w-4" />Back to project wiki</button>{!editable && <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">Read only</span>}</div>
    <header className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-xs"><div className="flex items-start gap-3"><div className="rounded-lg bg-blue-50 p-2 text-primary"><LuBookOpen className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{project?.name || 'Project'} wiki</p><h1 className="mt-1 text-xl font-bold text-gray-900">{isNew ? 'New wiki page' : document?.title}</h1></div></div></header>
    {!isDocumentsModuleEnabled && <div role="alert" className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><LuTriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />The Documents module is disabled. This page remains readable, but changes cannot be saved.</div>}
    {saveError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</div>}
    <form onSubmit={save} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-100 px-5 py-4"><label htmlFor="wiki-title" className="text-xs font-semibold text-gray-700">Page title</label><input id="wiki-title" value={title} onChange={(event) => setDraftTitle(event.target.value)} disabled={!editable} maxLength={500} placeholder="e.g. Architecture decision record" className="mt-2 w-full border-0 px-0 text-xl font-semibold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-0 disabled:bg-transparent" /></div>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2"><span className="mr-1 text-[11px] font-medium text-gray-500">Markdown</span>{INSERTIONS.map(({ label, icon: Icon, text }) => <button key={label} type="button" onClick={() => insertText(text)} disabled={!editable} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-200 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"><Icon className="h-3.5 w-3.5" />{label}</button>)}<span className="ml-auto text-[11px] text-gray-400">Drag the divider to resize panes</span></div>
      <div className="grid gap-0 lg:hidden"><div className="border-b border-gray-100 p-4">{editor}</div><div className="bg-gray-50/70 p-4">{preview}</div></div>
      <div ref={splitRef} className={`hidden min-h-[36rem] lg:grid ${isResizing ? 'cursor-col-resize select-none' : ''}`} style={{ gridTemplateColumns: `${splitPercent}% 12px ${100 - splitPercent}%` }}><div className="p-5">{editor}</div><button type="button" onPointerDown={(event) => { event.preventDefault(); setIsResizing(true); }} aria-label="Resize editor and preview panes" aria-orientation="vertical" role="separator" aria-valuemin="28" aria-valuemax="72" aria-valuenow={Math.round(splitPercent)} className="group relative cursor-col-resize border-x border-gray-100 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40"><span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-gray-300 transition-colors group-hover:bg-primary" /></button><div className="bg-gray-50/70 p-5">{preview}</div></div>
      <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3"><p className="text-xs text-gray-500">{isNew ? 'Publish when the page is ready for your project.' : `Last updated ${document?.updatedAt ? new Date(document.updatedAt).toLocaleString() : 'just now'}`}</p>{editable && <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><LuSave className="h-4 w-4" />{isSaving ? 'Saving...' : isNew ? 'Publish page' : 'Save changes'}</button>}</div>
    </form>{!isNew && !editable && <p className="flex items-center gap-2 text-xs text-gray-500"><LuCheck className="h-4 w-4 text-emerald-600" />This wiki page is preserved as read-only for your current project role or module setting.</p>}
  </main></DashboardLayout>;
};

export default ProjectDocumentPage;
