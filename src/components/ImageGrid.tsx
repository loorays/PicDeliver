/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Trash2, 
  AlertCircle, 
  RefreshCw, 
  X, 
  Check 
} from 'lucide-react';
import { ImageItem, CDNType, GitHubRepoInfo } from '../types';
import { formatBytes } from '../utils';
import { translations, Language } from '../translations';
import { deleteImageFromGitHub } from '../githubApi';

interface ImageGridProps {
  images: ImageItem[];
  selectedCdn: CDNType;
  selectedCdnName: string;
  lang: Language;
  onClear?: () => void;
  activeRepo?: GitHubRepoInfo | null;
  token?: string;
  onTokenSave?: (token: string) => void;
  onDeleteImage?: (deletedSha: string) => void;
}

export default function ImageGrid({ 
  images, 
  selectedCdn, 
  selectedCdnName, 
  lang, 
  onClear,
  activeRepo,
  token,
  onTokenSave,
  onDeleteImage
}: ImageGridProps) {
  const t = translations[lang];
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'path'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const viewMode = 'list'; // Default exclusively to minimalist horizontal long cards
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5); // Default to 5 items per user request
  const [copiedAllText, setCopiedAllText] = useState<'url' | 'markdown' | 'html' | null>(null);
  const [individualCopiedId, setIndividualCopiedId] = useState<string | null>(null);
  const [activeZoomImage, setActiveZoomImage] = useState<ImageItem | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  // Delete target and modal states
  const [deleteTarget, setDeleteTarget] = useState<ImageItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccessToast, setDeleteSuccessToast] = useState<string | null>(null);

  const resolveImageRepoInfo = (img: ImageItem): { owner: string; repo: string; branch: string } | null => {
    if (activeRepo && activeRepo.owner && activeRepo.repo) {
      return {
        owner: activeRepo.owner,
        repo: activeRepo.repo,
        branch: activeRepo.branch || 'main',
      };
    }
    if (img.downloadUrl) {
      const match = img.downloadUrl.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
      if (match) {
        return {
          owner: match[1],
          repo: match[2],
          branch: match[3],
        };
      }
    }
    const anyUrl = Object.values(img.cdnUrls)[0] || '';
    const jsdMatch = anyUrl.match(/gh\/([^\/]+)\/([^\/@]+)@([^\/]+)/);
    if (jsdMatch) {
      return {
        owner: jsdMatch[1],
        repo: jsdMatch[2],
        branch: jsdMatch[3],
      };
    }
    return null;
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const currentToken = (token || localStorage.getItem('gh_cdn_token') || '').trim();
    if (!currentToken) {
      setDeleteError(
        lang === 'zh'
          ? '未检测到 GitHub Token。删除仓库文件需写入权限，请先在主界面「高级选项」配置具备 repo 权限的 Token。'
          : 'No GitHub Token detected. Please configure a Token with repo permissions in Advanced Settings.'
      );
      return;
    }

    const repoInfo = resolveImageRepoInfo(deleteTarget);
    if (!repoInfo) {
      setDeleteError(
        lang === 'zh'
          ? '未能解析该文件所属的目标仓库信息，无法发起删除。'
          : 'Could not resolve target repository for this image.'
      );
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError(null);

      await deleteImageFromGitHub({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        branch: repoInfo.branch,
        filePath: deleteTarget.path,
        sha: deleteTarget.sha,
        token: currentToken,
        commitMessage: `🗑️ Delete ${deleteTarget.name} via PicDeliver`,
      });

      // Notify parent to remove from local image list
      onDeleteImage?.(deleteTarget.sha);

      const successName = deleteTarget.name;
      setDeleteTarget(null);
      setDeleteSuccessToast(
        lang === 'zh'
          ? `已成功从 GitHub 仓库删除 ${successName}`
          : `Successfully deleted ${successName} from GitHub`
      );
      setTimeout(() => setDeleteSuccessToast(null), 3500);
    } catch (err: any) {
      if (err.message === 'MISSING_TOKEN') {
        setDeleteError(
          lang === 'zh'
            ? '未检测到 Token。请先在页面「高级选项」配置包含 repo 权限的 GitHub Token。'
            : 'Token missing. Please configure a Token with repo permissions in Advanced Settings.'
        );
      } else if (err.message === 'TOKEN_NO_PERMISSION') {
        setDeleteError(
          lang === 'zh'
            ? '权限不足：当前 Token 缺少写入权限（非 repo 权限或未开启 contents:write）。经典 Token 请勾选 repo 权限，细粒度 Token 请开启 Contents: Read and write。'
            : 'Insufficient permissions: Token lacks repo write permissions (repo scope or Contents: Read and write).'
        );
      } else if (err.message === 'TOKEN_INVALID') {
        setDeleteError(
          lang === 'zh'
            ? 'Token 无效或已失效，请在「高级选项」核对并更新您的 GitHub Token。'
            : 'Token is invalid or expired. Please check your token in Advanced Settings.'
        );
      } else if (err.message === 'REPO_OR_FILE_NOT_FOUND') {
        setDeleteError(
          lang === 'zh'
            ? '目标仓库或文件未找到，或当前 Token 无权访问此私有仓库。'
            : 'Repository or file not found, or token lacks access to private repository.'
        );
      } else if (err.message === 'SHA_MISMATCH') {
        setDeleteError(
          lang === 'zh'
            ? '文件版本发生变化（SHA 不一致），请刷新页面后重试。'
            : 'File SHA has changed. Please refresh and try again.'
        );
      } else {
        setDeleteError(err.message || (lang === 'zh' ? '删除失败，请检查网络或 Token 权限。' : 'Delete failed.'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Sorting and filtering logic
  const filteredAndSortedImages = useMemo(() => {
    let result = [...images];

    // Filter by name or path
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(item => 
        item.name.toLowerCase().includes(lowerSearch) || 
        item.path.toLowerCase().includes(lowerSearch)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'size') {
        comparison = a.size - b.size;
      } else if (sortBy === 'path') {
        comparison = a.path.localeCompare(b.path);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [images, searchTerm, sortBy, sortOrder]);

  // Pagination bounds
  const paginatedImages = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedImages.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedImages, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedImages.length / itemsPerPage) || 1;

  // Track image load errors
  const handleImageError = (sha: string) => {
    setImageErrors(prev => ({ ...prev, [sha]: true }));
  };

  // Toggle sort order
  const handleSort = (field: 'name' | 'size' | 'path') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  // One-click copy methods
  const copyToClipboard = async (text: string, type: 'url' | 'markdown' | 'html', isAll = false, id: string | null = null) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isAll) {
        setCopiedAllText(type);
        setTimeout(() => setCopiedAllText(null), 2500);
      } else if (id) {
        setIndividualCopiedId(`${id}-${type}`);
        setTimeout(() => setIndividualCopiedId(null), 1500);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const getLinksText = (type: 'url' | 'markdown' | 'html') => {
    return filteredAndSortedImages.map(img => {
      const url = img.cdnUrls[selectedCdn];
      if (type === 'markdown') return `![${img.name}](${url})`;
      if (type === 'html') return `<img src="${url}" alt="${img.name}" />`;
      return url;
    }).join('\n');
  };

  const handleCopyAll = (type: 'url' | 'markdown' | 'html') => {
    const text = getLinksText(type);
    copyToClipboard(text, type, true);
  };

  return (
    <div className="space-y-6 animate-fade-in" id="image-grid-section">
      {/* Search and control filter action panel */}
      <div className="bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800 rounded-3xl p-4 sm:p-6 space-y-4 shadow-md shadow-slate-200/40 dark:shadow-none hover:shadow-lg transition-all duration-300">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h3 className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 sm:gap-2">
                <i className="fa-solid fa-images text-black dark:text-slate-350 text-[16px] shrink-0"></i>
                {t.resultsSubtitleLeft}
                <span className="text-zinc-950 dark:text-emerald-450 font-extrabold font-mono">{images.length}</span>
                {t.resultsSubtitleRight}
              </h3>
              <p className="text-[9px] sm:text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed font-sans">
                {t.resultsDesc} ({selectedCdnName})
              </p>
            </div>

            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:text-rose-600 dark:hover:text-rose-450 hover:border-rose-200 dark:hover:border-rose-950/60 hover:bg-rose-50/50 dark:hover:bg-rose-950/10 transition-all shadow-xs cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>{lang === 'zh' ? '清除检测数据' : 'Clear Detected Data'}</span>
              </button>
            )}
          </div>

          {/* Batch copy actions with unified black icons */}
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 pt-2 border-t border-slate-50 dark:border-slate-800">
            <button
              onClick={() => handleCopyAll('url')}
              id="copy-all-urls"
              className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-black text-white hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:hover:text-black font-extrabold transition-all shadow-xs cursor-pointer"
            >
              {copiedAllText === 'url' ? (
                <>
                  <i className="fa-solid fa-check text-[14px] text-white"></i>
                  <span>{t.copiedAllUrls.substring(0, 10)}...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-copy text-[14px] text-white"></i>
                  <span>{t.btnCopyAll}</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleCopyAll('markdown')}
              id="copy-all-markdown"
              className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-[#090D16] text-black dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all shadow-xs cursor-pointer"
            >
              {copiedAllText === 'markdown' ? (
                <>
                  <i className="fa-solid fa-check text-[14px] text-black dark:text-emerald-450 font-bold"></i>
                  <span>{t.copiedAllMD.substring(0, 10)}...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-code text-[14px] text-black dark:text-slate-400"></i>
                  <span>{t.btnCopyMD}</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleCopyAll('html')}
              id="copy-all-html"
              className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-[#090D16] text-black dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all shadow-xs cursor-pointer"
            >
              {copiedAllText === 'html' ? (
                <>
                  <i className="fa-solid fa-check text-[14px] text-black dark:text-emerald-450 font-bold"></i>
                  <span>{t.copiedAllHTML.substring(0, 10)}...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-file-image text-[14px] text-black dark:text-slate-400"></i>
                  <span>{t.btnCopyHTML}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search, Filter inputs */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0 w-full md:max-w-md">
            {/* Search Input bar */}
            <div className="relative flex-1 rounded-lg shadow-xs">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <i className="fa-solid fa-magnifying-glass text-black dark:text-slate-400 text-[15px]"></i>
              </div>
              <input
                type="text"
                id="search-filter-input"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder={t.searchPlaceholder}
                className="block w-full rounded-xl border border-slate-205 dark:border-slate-800 py-2.5 pl-9 pr-3 text-xs font-sans placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-slate-450 focus:ring-2 focus:ring-slate-100/60 bg-white dark:bg-[#090D16] text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Sorting Buttons */}
          <div className="flex items-center w-full sm:w-auto rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-100/60 dark:bg-[#090D16] p-1 shrink-0 md:ml-auto select-none" id="sort-controls-panel">
            <b className="text-[10px] text-slate-400 dark:text-slate-550 px-2 font-bold uppercase tracking-wider hidden sm:block">{t.sortByLabel}</b>
            <button
              onClick={() => handleSort('name')}
              className={`flex items-center justify-center gap-1.5 flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all
                ${sortBy === 'name' ? 'bg-white dark:bg-[#151E33] shadow-xs text-slate-900 dark:text-white font-extrabold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <span>{t.sortName}</span>
              <i className="fa-solid fa-sort text-[13px] text-black dark:text-slate-350 shrink-0"></i>
            </button>
            <button
              onClick={() => handleSort('size')}
              className={`flex items-center justify-center gap-1.5 flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all
                ${sortBy === 'size' ? 'bg-white dark:bg-[#151E33] shadow-xs text-slate-900 dark:text-white font-extrabold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <span>{t.sortSize}</span>
              <i className="fa-solid fa-sort text-[13px] text-black dark:text-slate-350 shrink-0"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Main card list visualization */}
      {filteredAndSortedImages.length === 0 ? (
        <div className="bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800 rounded-3xl p-12 text-center shadow-md shadow-slate-200/40 dark:shadow-none hover:shadow-lg transition-all duration-300">
          <i className="fa-solid fa-triangle-exclamation text-amber-500 text-3xl mb-3"></i>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{t.noResultsTitle}</h4>
          <p className="text-xs text-slate-400 dark:text-slate-550 max-w-sm mx-auto mt-1 leading-relaxed">
            {t.noResultsDesc}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* ULTRA-MINIMALIST HORIZONTAL CARD */
        <div className="space-y-3.5" id="cdn-images-list-container">
          {paginatedImages.map((img) => {
            const hasError = imageErrors[img.sha];
            const cdnUrl = img.cdnUrls[selectedCdn];
            
            return (
              <div 
                key={img.sha} 
                className="bg-white dark:bg-[#090D16]/65 border border-slate-100 dark:border-slate-850/80 rounded-2xl p-4 shadow-xs dark:shadow-none hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.005] transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left side: Thumbnail + File details */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Thumbnail (clean square with small rounded corners) */}
                  <div className="relative w-14 h-14 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#151E33] flex-shrink-0 flex items-center justify-center overflow-hidden shadow-2xs hover:ring-2 hover:ring-slate-200/60 transition-all">
                    {hasError ? (
                      <div className="text-center p-1">
                        <i className="fa-solid fa-triangle-exclamation text-amber-500 text-xs"></i>
                      </div>
                    ) : (
                      <img
                        src={cdnUrl}
                        alt={img.name}
                        referrerPolicy="no-referrer"
                        onError={() => handleImageError(img.sha)}
                        className="object-cover w-full h-full cursor-pointer hover:scale-105 transition-transform duration-200"
                        onClick={() => setActiveZoomImage(img)}
                      />
                    )}
                  </div>

                  {/* Metadata labels */}
                  <div className="min-w-0">
                    <h4 
                      className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate tracking-tight font-sans cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors select-all"
                      onClick={() => setActiveZoomImage(img)}
                      title={img.name}
                    >
                      {img.name}
                    </h4>
                    
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 dark:text-slate-450 font-medium truncate select-all">
                      <span className="truncate hover:text-slate-600 dark:hover:text-slate-300" title={img.path}>{img.path}</span>
                      <span className="text-slate-300 dark:text-slate-650 font-bold">•</span>
                      <span>{formatBytes(img.size, 1)}</span>
                      <span className="text-slate-300 dark:text-slate-650 font-bold">•</span>
                      <span className="uppercase font-mono text-[10px] bg-slate-100 dark:bg-[#121826]/85 border border-slate-150/10 rounded px-1.5 py-0.5 text-slate-500 dark:text-slate-450 font-bold">
                        {img.name.split('.').pop() || 'IMG'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Modern, super compact copy actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto md:shrink-0 select-none">
                  {/* Primary copy buttons: Grid on mobile, flex on desktop */}
                  <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2 w-full sm:w-auto">
                    {/* Copy URL */}
                    <button
                      onClick={() => copyToClipboard(cdnUrl, 'url', false, img.sha)}
                      className={`px-2 py-2 sm:px-3 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border
                        ${individualCopiedId === `${img.sha}-url`
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400 font-extrabold'
                          : 'bg-slate-50 border-transparent hover:border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-[#121826]/60 dark:border-slate-750 dark:text-slate-300 dark:hover:bg-[#121826]'
                        }`}
                    >
                      {individualCopiedId === `${img.sha}-url` ? (
                        <>
                          <i className="fa-solid fa-check text-emerald-600 dark:text-emerald-400"></i>
                          <span>{lang === 'zh' ? '已复制' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-link text-slate-500 dark:text-slate-400"></i>
                          <span>URL</span>
                        </>
                      )}
                    </button>

                    {/* Copy Markdown */}
                    <button
                      onClick={() => copyToClipboard(`![${img.name}](${cdnUrl})`, 'markdown', false, img.sha)}
                      className={`px-2 py-2 sm:px-3 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border
                        ${individualCopiedId === `${img.sha}-markdown`
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400 font-extrabold'
                          : 'bg-slate-50 border-transparent hover:border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-[#121826]/60 dark:border-slate-750 dark:text-slate-300 dark:hover:bg-[#121826]'
                        }`}
                    >
                      {individualCopiedId === `${img.sha}-markdown` ? (
                        <>
                          <i className="fa-solid fa-check text-emerald-600 dark:text-emerald-400"></i>
                          <span className="truncate">Markdown</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-code text-slate-500 dark:text-slate-400"></i>
                          <span>MD</span>
                        </>
                      )}
                    </button>

                    {/* Copy HTML */}
                    <button
                      onClick={() => copyToClipboard(`<img src="${cdnUrl}" alt="${img.name}" />`, 'html', false, img.sha)}
                      className={`px-2 py-2 sm:px-3 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border
                        ${individualCopiedId === `${img.sha}-html`
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400 font-extrabold'
                          : 'bg-slate-50 border-transparent hover:border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-[#121826]/60 dark:border-slate-750 dark:text-slate-300 dark:hover:bg-[#121826]'
                        }`}
                    >
                      {individualCopiedId === `${img.sha}-html` ? (
                        <>
                          <i className="fa-solid fa-check text-emerald-600 dark:text-emerald-400"></i>
                          <span>HTML</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-file-image text-slate-500 dark:text-slate-400"></i>
                          <span>HTML</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Divider - show on desktop / larger screens */}
                  <span className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1 hidden md:block" />

                  {/* Utility action links: Open in new tab, Zoom view, Delete */}
                  <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                    {/* Open in new tab icon pill */}
                    <a
                      href={cdnUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-[28%] sm:w-8.5 flex-none h-8.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121826] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 flex items-center justify-center text-[11px] sm:text-xs transition-all shadow-2xs gap-1 px-1.5 sm:px-0 cursor-pointer"
                      title={t.openNewTab}
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square text-[11px]"></i>
                      <span className="sm:hidden font-medium text-[11px] truncate">{lang === 'zh' ? '新窗口' : 'New Tab'}</span>
                    </a>

                    {/* Zoom Preview button */}
                    <button
                      type="button"
                      onClick={() => setActiveZoomImage(img)}
                      className="w-[36%] sm:w-8.5 flex-none h-8.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121826] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 flex items-center justify-center text-[11px] sm:text-xs transition-all shadow-2xs gap-1.5 px-2 sm:px-0 cursor-pointer"
                      title={t.previewTitle}
                    >
                      <i className="fa-solid fa-magnifying-glass-plus text-[11px]"></i>
                      <span className="sm:hidden font-medium text-[11px] truncate">{lang === 'zh' ? '效果预览' : 'Zoom Preview'}</span>
                    </button>

                    {/* Delete Image button with secondary confirmation */}
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(img);
                        setDeleteError(null);
                      }}
                      className="w-[28%] sm:w-8.5 flex-none h-8.5 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-white dark:bg-[#121826] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:border-rose-300 dark:hover:border-rose-800 flex items-center justify-center text-[11px] sm:text-xs transition-all shadow-2xs gap-1 px-1.5 sm:px-0 cursor-pointer"
                      title={lang === 'zh' ? '从 GitHub 仓库删除图片' : 'Delete image from GitHub'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sm:hidden font-medium text-[11px] truncate">{lang === 'zh' ? '删除' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ULTRA-MINIMALIST BENTO GRID GRID CARD */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" id="cdn-images-grid-container">
          {paginatedImages.map((img) => {
            const hasError = imageErrors[img.sha];
            const cdnUrl = img.cdnUrls[selectedCdn];
            
            return (
              <div 
                key={img.sha} 
                className="bg-white dark:bg-[#090D16]/65 border border-slate-100 dark:border-slate-850/80 rounded-2xl p-4 shadow-xs dark:shadow-none hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.01] transition-all duration-300 flex flex-col justify-between gap-3"
              >
                {/* Thumbnail and title row */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#151E33] flex-shrink-0 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-slate-200/60 transition-all shrink-0">
                    {hasError ? (
                      <i className="fa-solid fa-triangle-exclamation text-amber-550 text-xs"></i>
                    ) : (
                      <img
                        src={cdnUrl}
                        alt={img.name}
                        referrerPolicy="no-referrer"
                        onError={() => handleImageError(img.sha)}
                        className="object-cover w-full h-full hover:scale-105 transition-transform duration-200 cursor-pointer"
                        onClick={() => setActiveZoomImage(img)}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 
                      className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate font-sans tracking-tight cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors"
                      onClick={() => setActiveZoomImage(img)}
                      title={img.name}
                    >
                      {img.name}
                    </h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-450 font-mono truncate mt-0.5" title={img.path}>{img.path}</p>
                  </div>
                </div>

                {/* File size information badge */}
                <div className="flex items-center gap-2 text-[10.5px] text-slate-450 dark:text-slate-400 font-medium">
                  <span>{formatBytes(img.size, 1)}</span>
                  <span className="text-slate-300 dark:text-slate-650 font-bold">•</span>
                  <span className="uppercase font-mono text-[9px] bg-slate-50 dark:bg-[#151E33] rounded px-1.5 py-0.5 text-slate-500 dark:text-slate-400 font-bold border border-slate-100 dark:border-slate-800">
                    {img.name.split('.').pop() || 'IMG'}
                  </span>
                </div>

                {/* Bottom simple buttons row */}
                <div className="flex items-center justify-between gap-2 border-t border-slate-50 dark:border-slate-800 pt-2.5 mt-1">
                  <span className="text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#151E33] px-1.5 py-0.5 rounded border border-transparent dark:border-slate-800/80">
                    {selectedCdnName}
                  </span>

                  <div className="flex items-center gap-1.5 select-none text-slate-400">
                    {/* Copy Link button */}
                    <button
                      onClick={() => copyToClipboard(cdnUrl, 'url', false, img.sha)}
                      className={`w-7.5 h-7.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer 
                        ${individualCopiedId === `${img.sha}-url`
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400 font-bold'
                          : 'bg-white border-slate-200 dark:bg-[#151E33] dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                        }`}
                      title={t.copyCellLink}
                    >
                      {individualCopiedId === `${img.sha}-url` ? (
                        <i className="fa-solid fa-check text-[11px] text-emerald-600 dark:text-emerald-400"></i>
                      ) : (
                        <i className="fa-solid fa-link text-[11px]"></i>
                      )}
                    </button>

                    {/* Copy Markdown syntax button */}
                    <button
                      onClick={() => copyToClipboard(`![${img.name}](${cdnUrl})`, 'markdown', false, img.sha)}
                      className={`w-7.5 h-7.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer
                        ${individualCopiedId === `${img.sha}-markdown`
                          ? 'bg-emerald-55 border-emerald-150 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400 font-bold'
                          : 'bg-white border-slate-200 dark:bg-[#151E33] dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                        }`}
                      title={`${t.mdCellBadge} Syntax`}
                    >
                      {individualCopiedId === `${img.sha}-markdown` ? (
                        <i className="fa-solid fa-check text-[11px] text-emerald-600 dark:text-emerald-400"></i>
                      ) : (
                        <i className="fa-solid fa-code text-[11px]"></i>
                      )}
                    </button>

                    {/* View Magnify button */}
                    <button
                      onClick={() => setActiveZoomImage(img)}
                      className="w-7.5 h-7.5 rounded-lg border border-slate-205 dark:border-slate-800 bg-white dark:bg-[#151E33] text-slate-705 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/60 flex items-center justify-center transition-all cursor-pointer"
                      title={t.previewTitle}
                    >
                      <i className="fa-solid fa-magnifying-glass-plus text-[11px]"></i>
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => {
                        setDeleteTarget(img);
                        setDeleteError(null);
                      }}
                      className="w-7.5 h-7.5 rounded-lg border border-rose-200/80 dark:border-rose-900/40 bg-white dark:bg-[#151E33] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:border-rose-300 dark:hover:border-rose-800 flex items-center justify-center transition-all cursor-pointer"
                      title={lang === 'zh' ? '从 GitHub 删除图片' : 'Delete image from GitHub'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination control with FontAwesome */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800 rounded-2xl p-4.5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md shadow-slate-200/40 dark:shadow-none hover:shadow-lg transition-all duration-300">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-sans">
            {t.pageShowing} <span className="font-extrabold text-slate-700 dark:text-slate-200 font-mono">{((currentPage - 1) * itemsPerPage) + 1}</span> {t.pageTo}{' '}
            <span className="font-extrabold text-slate-700 dark:text-slate-200 font-mono">
              {Math.min(currentPage * itemsPerPage, filteredAndSortedImages.length)}
            </span>{' '}
            {t.pageOf}{' '}
            <span className="font-extrabold text-slate-800 dark:text-slate-100 font-mono">{filteredAndSortedImages.length}</span> {t.pageEntries}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className={`h-8 w-8 rounded-lg flex items-center justify-center border border-slate-205 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#090D16] transition-all focus:outline-hidden cursor-pointer
                ${currentPage === 1 ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}`}
            >
              <i className="fa-solid fa-chevron-left text-[12px] text-black dark:text-slate-350 font-bold"></i>
            </button>
            
            <div className="flex items-center gap-1 text-xs">
              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .filter(num => num === 1 || num === totalPages || Math.abs(num - currentPage) <= 1)
                .map((number, idx, arr) => {
                  const isCurrent = currentPage === number;
                  const showEllipsis = idx > 0 && number - arr[idx - 1] > 1;

                  return (
                    <React.Fragment key={number}>
                      {showEllipsis && <span className="text-slate-400 px-1">...</span>}
                      <button
                        onClick={() => setCurrentPage(number)}
                        className={`h-8 w-8 rounded-lg font-bold flex items-center justify-center border cursor-pointer transition-all
                          ${isCurrent 
                            ? 'bg-slate-900 border-slate-900 text-white shadow-xs dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-500 font-extrabold' 
                            : 'bg-white dark:bg-[#090D16] border-slate-205 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                          }`}
                      >
                        {number}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className={`h-8 w-8 rounded-lg flex items-center justify-center border border-slate-205 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#090D16] transition-all focus:outline-hidden cursor-pointer
                ${currentPage === totalPages ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}`}
            >
              <i className="fa-solid fa-chevron-right text-[12px] text-black font-bold"></i>
            </button>
          </div>
        </div>
      )}

      {/* ZOOM LIGHTBOX MODAL */}
      {activeZoomImage && createPortal(
        <div 
          onClick={() => setActiveZoomImage(null)}
          className="fixed inset-0 bg-slate-900/35 backdrop-blur-xl z-50 flex items-center justify-center p-4 sm:p-6 transition-all duration-300 animate-fade-in"
          id="zoom-image-lightbox-modal"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white/95 backdrop-blur-md rounded-3xl max-w-4xl w-full overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.15)] relative flex flex-col"
          >
            {/* Modal Body: image preview */}
            <div className="relative bg-[#0F172A] p-4 min-h-[300px] sm:min-h-[450px] flex items-center justify-center">
              <img
                src={activeZoomImage.cdnUrls[selectedCdn]}
                alt={activeZoomImage.name}
                referrerPolicy="no-referrer"
                className="max-h-[65vh] rounded-md object-contain select-none"
              />
              
              {/* Close button overlay */}
              <button
                onClick={() => setActiveZoomImage(null)}
                className="absolute top-4 right-4 rounded-full h-9 w-9 bg-slate-800/80 hover:bg-slate-700/80 text-white flex items-center justify-center cursor-pointer transition-colors backdrop-blur-xs shadow-xs"
              >
                <i className="fa-solid fa-xmark text-[15px] text-white"></i>
              </button>
            </div>

            {/* Modal Footer fields */}
            <div className="p-5 sm:p-6 space-y-4 bg-slate-50 select-text">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5 font-sans">
                    {activeZoomImage.name}
                  </h3>
                  <code className="text-[10px] text-slate-400 font-mono font-medium truncate block mt-0.5">
                    {t.previewPath} {activeZoomImage.path} • {t.previewHash} {activeZoomImage.sha.substring(0, 8)}
                  </code>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase font-mono tracking-wider bg-slate-200 text-slate-700 font-extrabold px-2.5 py-1 rounded-full">
                    {formatBytes(activeZoomImage.size)}
                  </span>
                  <a
                    href={activeZoomImage.cdnUrls[selectedCdn]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-all cursor-pointer font-sans"
                  >
                    <span>{t.previewOrig}</span>
                    <i className="fa-solid fa-arrow-up-right-from-square text-[13px] text-black"></i>
                  </a>
                </div>
              </div>

              {/* Dynamic CDN path box */}
              <div className="space-y-2 pt-3 border-t border-slate-150">
                <label className="text-[10.5px] font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wide">
                  {t.previewCurrentCdn} ({selectedCdnName})
                </label>
                <div className="flex rounded-xl shadow-xs overflow-hidden border border-slate-200">
                  <input
                    type="text"
                    readOnly
                    value={activeZoomImage.cdnUrls[selectedCdn]}
                    className="bg-white flex-1 py-2 px-3 text-xs font-mono text-slate-600 select-all focus:outline-hidden"
                  />
                  <button
                    onClick={() => copyToClipboard(activeZoomImage.cdnUrls[selectedCdn], 'url', false, activeZoomImage.sha)}
                    className={`px-4 text-xs font-bold cursor-pointer border-l border-slate-200 transition-colors flex items-center gap-1.5 select-none
                      ${individualCopiedId === `${activeZoomImage.sha}-url`
                        ? 'bg-black text-white hover:bg-black'
                        : 'bg-black text-white hover:bg-slate-800'
                      }`}
                  >
                    {individualCopiedId === `${activeZoomImage.sha}-url` ? (
                      <>
                        <i className="fa-solid fa-check text-[14px]"></i>
                        <span>{t.copiedCellText}</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-regular fa-copy text-[14px]"></i>
                        <span>{t.copyCellLink.substring(0, 4)}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 max-w-[460px] sm:max-w-[480px] w-full shadow-2xl space-y-4 font-sans text-slate-800 dark:text-slate-100">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {lang === 'zh' ? '确认删除该图片？' : 'Delete this image?'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {lang === 'zh'
                    ? '将直接向 GitHub 提交删除 Commit，需已配置具备 repo 权限的 Token。'
                    : 'Commits deletion to GitHub. Requires Token with repo scope.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setDeleteTarget(null);
                    setDeleteError(null);
                  }
                }}
                disabled={isDeleting}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Target File Card */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#090D16] border border-slate-100 dark:border-slate-800">
              <img
                src={deleteTarget.cdnUrls[selectedCdn] || deleteTarget.downloadUrl}
                alt={deleteTarget.name}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-lg object-cover shrink-0 border border-slate-200/60 dark:border-slate-700/60"
              />
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-bold text-slate-800 dark:text-slate-100 truncate" title={deleteTarget.name}>
                  {deleteTarget.name}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 dark:text-slate-400 font-mono">
                  <span className="truncate" title={deleteTarget.path}>{deleteTarget.path}</span>
                  <span className="text-slate-300 dark:text-slate-600 font-bold shrink-0">•</span>
                  <span className="shrink-0">{formatBytes(deleteTarget.size, 1)}</span>
                </div>
              </div>
            </div>

            {/* Error Message Details (Only shown if delete failed) */}
            {deleteError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 space-y-1 animate-fade-in">
                <div className="flex items-center gap-1.5 font-bold text-rose-900 dark:text-rose-200">
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                  <span>{lang === 'zh' ? '删除失败：' : 'Deletion Failed:'}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                  {deleteError}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setDeleteTarget(null);
                    setDeleteError(null);
                  }
                }}
                disabled={isDeleting}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>{lang === 'zh' ? '正在删除...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{lang === 'zh' ? '确认删除' : 'Delete'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Success Notification Toast */}
      {deleteSuccessToast && createPortal(
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold animate-fade-in">
          <Check className="h-4 w-4" />
          <span>{deleteSuccessToast}</span>
        </div>,
        document.body
      )}
    </div>
  );
}
