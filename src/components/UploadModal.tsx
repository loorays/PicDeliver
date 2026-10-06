/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Upload, 
  Folder, 
  FolderPlus, 
  Key, 
  Github, 
  Check, 
  Copy, 
  ExternalLink, 
  RefreshCw, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Link as LinkIcon, 
  FileCode, 
  Code, 
  FileText, 
  Plus, 
  GitBranch, 
  CheckCircle2, 
  Image as ImageIcon, 
  HelpCircle,
  Trash2
} from 'lucide-react';
import { GitHubRepoInfo, CDNType, CDNNode, ImageItem } from '../types';
import { parseGitHubUrl, buildCdnUrl, formatBytes } from '../utils';
import { fetchRepoDirectories, uploadImageToGitHub } from '../githubApi';
import { translations, Language } from '../translations';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  selectedCdn: CDNType;
  dynamicCdns: CDNNode[];
  onSelectCdn: (cdn: CDNType) => void;
  initialRepoInfo: GitHubRepoInfo | null;
  initialToken: string;
  onTokenSave: (token: string) => void;
  onImageUploaded: (imageItem: ImageItem) => void;
  initialFile?: File | null;
  onClearInitialFile?: () => void;
}

export default function UploadModal({
  isOpen,
  onClose,
  lang,
  selectedCdn,
  dynamicCdns,
  onSelectCdn,
  initialRepoInfo,
  initialToken,
  onTokenSave,
  onImageUploaded,
  initialFile,
  onClearInitialFile,
}: UploadModalProps) {
  const t = translations[lang];

  // Repository input & configuration
  const [repoInput, setRepoInput] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState(initialToken);
  const [showToken, setShowToken] = useState(false);

  // Folder configuration
  const [folderMode, setFolderMode] = useState<'select' | 'create'>('select');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState<string>('images');
  const [existingFolders, setExistingFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // File selection
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [useYmdhmsName, setUseYmdhmsName] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to format file name as Year-Month-Day-Hour-Minute-Second (年月日时分秒: YYYYMMDDHHmmss.ext)
  const generateYMDHMSFileName = (file: File): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    const dotIdx = file.name.lastIndexOf('.');
    let ext = '.png';
    if (dotIdx !== -1 && file.name.substring(dotIdx).length <= 5) {
      ext = file.name.substring(dotIdx).toLowerCase();
    } else if (file.type) {
      const typePart = file.type.split('/')[1];
      if (typePart) {
        ext = `.${typePart === 'jpeg' ? 'jpg' : typePart}`;
      }
    }
    return `${year}${month}${day}${hour}${minute}${second}${ext}`;
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setFileName('');
    setUploadError(null);
    setShowBigPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleToggleNaming = (checked: boolean) => {
    setUseYmdhmsName(checked);
    if (selectedFile) {
      const originalOrFallback = (selectedFile.name && selectedFile.name !== 'blob') ? selectedFile.name : 'pasted_image.png';
      setFileName(checked ? generateYMDHMSFileName(selectedFile) : originalOrFallback);
    }
  };

  // Upload status
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessResult, setUploadSuccessResult] = useState<{
    filePath: string;
    sha: string;
    size: number;
    downloadUrl: string;
    htmlUrl?: string;
    uploadedName: string;
  } | null>(null);

  // Copy feedback
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Big image lightbox modal state (view full size)
  const [showBigPreview, setShowBigPreview] = useState(false);

  // Close big preview on Escape
  useEffect(() => {
    if (!showBigPreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowBigPreview(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showBigPreview]);

  // Prepopulate repoInput when opening
  useEffect(() => {
    if (isOpen) {
      if (initialRepoInfo) {
        setRepoInput(`${initialRepoInfo.owner}/${initialRepoInfo.repo}`);
        if (initialRepoInfo.branch) {
          setBranch(initialRepoInfo.branch);
        }
        if (initialRepoInfo.path) {
          setSelectedFolder(initialRepoInfo.path);
        }
      }
      if (initialToken) {
        setToken(initialToken);
      }
    }
  }, [isOpen, initialRepoInfo, initialToken]);

  // Parse repo info
  const parseRepo = (): { owner: string; repo: string } | null => {
    if (!repoInput.trim()) return null;
    const trimmed = repoInput.trim();
    if (trimmed.includes('github.com')) {
      const parsed = parseGitHubUrl(trimmed);
      if (parsed) return { owner: parsed.owner, repo: parsed.repo };
    }
    const parts = trimmed.replace(/^https?:\/\/github\.com\//, '').split('/');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }
    return null;
  };

  // Fetch folders
  const loadFolders = async () => {
    const repoData = parseRepo();
    if (!repoData) return;
    setLoadingFolders(true);
    try {
      const dirs = await fetchRepoDirectories(repoData.owner, repoData.repo, branch, token);
      setExistingFolders(dirs);
      if (dirs.length > 0 && !selectedFolder) {
        const match = dirs.find(d => d === 'images' || d === 'img' || d.startsWith('images/') || d.startsWith('img/'));
        if (match) setSelectedFolder(match);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    if (isOpen && repoInput) {
      const timer = setTimeout(loadFolders, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, repoInput, branch, token]);

  // Handle file selection (from file picker, drag & drop, or Ctrl+V clipboard paste)
  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError(lang === 'zh' ? '请选择有效的图片文件' : 'Please select an image file');
      return;
    }
    setSelectedFile(file);
    const originalOrFallback = (file.name && file.name !== 'blob') ? file.name : 'pasted_image.png';
    const chosenName = useYmdhmsName ? generateYMDHMSFileName(file) : originalOrFallback;
    setFileName(chosenName);
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      setFilePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Watch for initialFile (e.g. from global Ctrl+V paste on main screen)
  useEffect(() => {
    if (isOpen && initialFile) {
      handleFileChange(initialFile);
      onClearInitialFile?.();
    }
  }, [isOpen, initialFile]);

  // Listen for Ctrl+V paste directly inside the modal
  useEffect(() => {
    if (!isOpen || uploadSuccessResult) return;

    const handleModalPaste = (e: ClipboardEvent) => {
      // If user is pasting text into an input or textarea, let text paste happen
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        const text = e.clipboardData?.getData('text/plain');
        if (text && text.trim().length > 0) return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFileChange(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handleModalPaste);
    return () => {
      window.removeEventListener('paste', handleModalPaste);
    };
  }, [isOpen, uploadSuccessResult, useYmdhmsName]);

  // Handle Token change
  const handleTokenChange = (val: string) => {
    setToken(val);
    onTokenSave(val);
  };

  // Start Upload
  const handleUpload = async () => {
    setUploadError(null);
    const repoData = parseRepo();
    if (!repoData) {
      setUploadError(t.uploadErrNoRepo);
      return;
    }
    if (!token.trim()) {
      setUploadError(t.uploadErrNoToken);
      return;
    }
    if (!selectedFile) {
      setUploadError(t.uploadErrNoFile);
      return;
    }

    const targetFolder = folderMode === 'select' ? selectedFolder : newFolderName.trim().replace(/^\/+|\/+$/g, '');
    let finalFileName = fileName.trim() || generateYMDHMSFileName(selectedFile);
    const dirDisplayName = targetFolder || (lang === 'zh' ? '根' : 'root');

    setUploading(true);

    try {
      let result;
      try {
        result = await uploadImageToGitHub({
          owner: repoData.owner,
          repo: repoData.repo,
          branch: branch.trim() || 'main',
          folderPath: targetFolder,
          fileName: finalFileName,
          file: selectedFile,
          token: token.trim(),
          commitMessage: `在${dirDisplayName}目录下创建了${finalFileName}`,
        });
      } catch (err: any) {
        // If a file with this name already exists in the same hour, append minute/second to guarantee uniqueness
        if (err.message === 'FILE_ALREADY_EXISTS') {
          const now = new Date();
          const min = String(now.getMinutes()).padStart(2, '0');
          const sec = String(now.getSeconds()).padStart(2, '0');
          const extIdx = finalFileName.lastIndexOf('.');
          const baseName = extIdx !== -1 ? finalFileName.substring(0, extIdx) : finalFileName;
          const ext = extIdx !== -1 ? finalFileName.substring(extIdx) : '';
          finalFileName = `${baseName}_${min}${sec}${ext}`;

          result = await uploadImageToGitHub({
            owner: repoData.owner,
            repo: repoData.repo,
            branch: branch.trim() || 'main',
            folderPath: targetFolder,
            fileName: finalFileName,
            file: selectedFile,
            token: token.trim(),
            commitMessage: `在${dirDisplayName}目录下创建了${finalFileName}`,
          });
        } else {
          throw err;
        }
      }

      setUploadSuccessResult({
        filePath: result.path,
        sha: result.sha,
        size: result.size,
        downloadUrl: result.downloadUrl,
        htmlUrl: result.htmlUrl,
        uploadedName: finalFileName,
      });

      // Construct ImageItem for active CDN
      const cdnUrls: Record<string, string> = {};
      dynamicCdns.forEach(node => {
        cdnUrls[node.id] = buildCdnUrl(node.prefix, repoData.owner, repoData.repo, branch, result.path);
      });

      const newImageItem: ImageItem = {
        name: finalFileName,
        path: result.path,
        size: result.size,
        sha: result.sha,
        cdnUrls,
        downloadUrl: result.downloadUrl,
      };

      onImageUploaded(newImageItem);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'MISSING_TOKEN') setUploadError(t.uploadErrNoToken);
      else if (err.message === 'TOKEN_INVALID') setUploadError(t.uploadErrTokenInvalid);
      else if (err.message === 'TOKEN_NO_PERMISSION') setUploadError(t.uploadErrTokenPermission);
      else if (err.message === 'REPO_OR_BRANCH_NOT_FOUND') setUploadError(t.uploadErrNotFound);
      else if (err.message === 'FILE_ALREADY_EXISTS') setUploadError(t.uploadErrExists);
      else setUploadError(err.message || (lang === 'zh' ? '上传失败，请检查设置' : 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  // Reset to upload another file
  const handleResetForNext = () => {
    handleClearFile();
    setUploadSuccessResult(null);
    setShowBigPreview(false);
  };

  // Active CDN node & generated URL
  const activeNode = dynamicCdns.find(n => n.id === selectedCdn) || dynamicCdns[0];
  const repoData = parseRepo();
  const currentCdnUrl = uploadSuccessResult && repoData && activeNode
    ? buildCdnUrl(activeNode.prefix, repoData.owner, repoData.repo, branch, uploadSuccessResult.filePath)
    : '';

  // Copy helper
  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 1800);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div 
        className="bg-white dark:bg-[#151E33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Simple & Clean */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-4.5 w-4.5 text-slate-900 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {uploadSuccessResult 
                ? (lang === 'zh' ? '上传成功' : 'Upload Successful')
                : (lang === 'zh' ? '上传图片到 GitHub' : 'Upload Image')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          
          {/* ================= SUCCESS PAGE ================= */}
          {uploadSuccessResult ? (
            <div className="space-y-4 animate-fade-in">
              
              {/* Image Preview & Info Card */}
              <div className="flex items-center gap-3.5 bg-slate-50 dark:bg-[#090D16] p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBigPreview(true)}
                  title={lang === 'zh' ? '点击查看大图' : 'Click to view full size'}
                  className="h-16 w-16 rounded-lg bg-white dark:bg-[#151E33] border border-slate-200/60 dark:border-slate-800 flex items-center justify-center overflow-hidden shrink-0 p-1 hover:ring-2 hover:ring-emerald-500/50 transition-all cursor-zoom-in group/thumb relative"
                >
                  <img
                    src={filePreview || currentCdnUrl}
                    alt={uploadSuccessResult.uploadedName}
                    className="max-h-full max-w-full object-contain rounded group-hover/thumb:scale-105 transition-transform"
                  />
                </button>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {uploadSuccessResult.filePath}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-400 mt-1 font-mono">
                    <span>{formatBytes(uploadSuccessResult.size)}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {branch}
                    </span>
                    <span>·</span>
                    <span className="font-sans font-bold text-slate-600 dark:text-slate-300">
                      {activeNode.name}
                    </span>
                  </div>
                </div>

                {uploadSuccessResult.htmlUrl && (
                  <a
                    href={uploadSuccessResult.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={lang === 'zh' ? '在 GitHub 中查看文件' : 'View on GitHub'}
                    className="p-2 rounded-lg bg-white dark:bg-[#151E33] border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    <Github className="h-4 w-4" />
                  </a>
                )}
              </div>

              {/* Generated CDN URL Bar with Preview in new tab & Copy button OUTSIDE */}
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={currentCdnUrl}
                  className="flex-1 min-w-0 bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden select-all"
                />
                <a
                  href={currentCdnUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={lang === 'zh' ? '在新标签页预览 CDN 图片' : 'Preview CDN image in new tab'}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090D16] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-xs"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => handleCopy(currentCdnUrl, 'url')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-xs ${
                    copiedType === 'url'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 hover:opacity-90'
                  }`}
                >
                  {copiedType === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedType === 'url' ? (lang === 'zh' ? '已复制' : 'Copied') : (lang === 'zh' ? '复制链接' : 'Copy Link')}</span>
                </button>
              </div>

              {/* Quick Format Copy Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(`![${uploadSuccessResult.uploadedName}](${currentCdnUrl})`, 'md')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    copiedType === 'md'
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600 dark:bg-emerald-950/20'
                      : 'bg-white dark:bg-[#090D16] border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {copiedType === 'md' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <FileCode className="h-3.5 w-3.5 text-slate-400" />}
                  <span>{copiedType === 'md' ? (lang === 'zh' ? '已复制' : 'Copied') : 'Markdown'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopy(`<img src="${currentCdnUrl}" alt="${uploadSuccessResult.uploadedName}" />`, 'html')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    copiedType === 'html'
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600 dark:bg-emerald-950/20'
                      : 'bg-white dark:bg-[#090D16] border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {copiedType === 'html' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Code className="h-3.5 w-3.5 text-slate-400" />}
                  <span>{copiedType === 'html' ? (lang === 'zh' ? '已复制' : 'Copied') : 'HTML'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopy(`[img]${currentCdnUrl}[/img]`, 'bbcode')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    copiedType === 'bbcode'
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600 dark:bg-emerald-950/20'
                      : 'bg-white dark:bg-[#090D16] border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {copiedType === 'bbcode' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <LinkIcon className="h-3.5 w-3.5 text-slate-400" />}
                  <span>{copiedType === 'bbcode' ? (lang === 'zh' ? '已复制' : 'Copied') : 'BBCode'}</span>
                </button>
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                  {lang === 'zh' ? '已加入图库' : 'Added to Grid'}
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {lang === 'zh' ? '关闭' : 'Close'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetForNext}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 hover:opacity-90 flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{lang === 'zh' ? '继续上传' : 'Upload Next'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            
            /* ================= UPLOAD FORM ================= */
            <div className="space-y-3.5">
              
              {/* Row 1: Repo + Branch */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Github className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="owner/repo"
                    className="w-full bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-slate-400"
                  />
                </div>
                <div className="relative w-28">
                  <GitBranch className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className="w-full bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-8 pr-2 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Row 2: Token */}
              <div className="relative">
                <Key className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => handleTokenChange(e.target.value)}
                  placeholder="GitHub Token (PAT)"
                  className="w-full bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-9 pr-24 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-slate-400"
                />
                <div className="absolute right-2.5 top-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    title={showToken ? (lang === 'zh' ? '隐藏 Token' : 'Hide') : (lang === 'zh' ? '显示 Token' : 'Show')}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-0.5 cursor-pointer"
                  >
                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=PicDeliver"
                    target="_blank"
                    rel="noopener noreferrer"
                    title={lang === 'zh' ? '快速申请 Token' : 'Generate Token'}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-0.5 cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>

                  {/* Help question mark with repo scope requirement */}
                  <div className="relative group/tokenhelp flex items-center">
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer transition-colors"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                    <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover/tokenhelp:block z-30 whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-[11px] shadow-md pointer-events-none animate-fade-in font-sans">
                      {lang === 'zh' ? 'Token 必须包含 repo 权限' : 'Token must include repo scope'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Target Folder */}
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <div className="flex bg-slate-100 dark:bg-[#090D16] p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-800 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setFolderMode('select')}
                    className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
                      folderMode === 'select'
                        ? 'bg-white dark:bg-[#151E33] text-slate-800 dark:text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Folder className="h-3.5 w-3.5 inline mr-1" />
                    {lang === 'zh' ? '已有目录' : 'Existing'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFolderMode('create')}
                    className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
                      folderMode === 'create'
                        ? 'bg-white dark:bg-[#151E33] text-slate-800 dark:text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <FolderPlus className="h-3.5 w-3.5 inline mr-1" />
                    {lang === 'zh' ? '新建目录' : 'New'}
                  </button>
                </div>

                {folderMode === 'select' ? (
                  <div className="flex flex-1 gap-1.5 items-center min-w-0 w-full">
                    <select
                      value={selectedFolder}
                      onChange={(e) => setSelectedFolder(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-xl py-1.5 px-2.5 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden truncate"
                    >
                      <option value="">/ ({lang === 'zh' ? '根目录' : 'Root'})</option>
                      {existingFolders.map((dir) => (
                        <option key={dir} value={dir}>{dir}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={loadFolders}
                      disabled={loadingFolders}
                      className="p-1.5 bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingFolders ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="images/upload"
                    className="flex-1 min-w-0 w-full bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-slate-400"
                  />
                )}
              </div>

              {/* Row 4: Image File Picker / Preview */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
              />

              {!selectedFile ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl py-6 px-4 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-emerald-500 bg-emerald-50/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-[#090D16]/40'
                  }`}
                >
                  <Upload className="h-6 w-6 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    {lang === 'zh' ? '点击、拖拽或按 Ctrl+V 粘贴图片' : 'Click, drag or press Ctrl+V to paste'}
                  </p>
                  <p className="text-[10.5px] text-slate-400 dark:text-slate-500 mt-1">
                    {lang === 'zh' ? '支持直接从剪切板粘贴截图或图片' : 'Supports pasting screenshots directly from clipboard'}
                  </p>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-[#090D16] p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowBigPreview(true)}
                      title={lang === 'zh' ? '点击查看大图' : 'Click to view full size'}
                      className="h-12 w-12 rounded-lg bg-white dark:bg-[#151E33] border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden shrink-0 p-1 cursor-zoom-in hover:ring-2 hover:ring-emerald-500/50 transition-all group/thumb"
                    >
                      {filePreview ? (
                        <img 
                          src={filePreview} 
                          alt="Preview" 
                          className="max-h-full max-w-full object-contain rounded group-hover/thumb:scale-105 transition-transform" 
                        />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-slate-400" />
                      )}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {fileName}
                        </span>
                        <button
                          type="button"
                          onClick={handleClearFile}
                          className="text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0 ml-2 flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{lang === 'zh' ? '清除' : 'Clear'}</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                        <span>{formatBytes(selectedFile.size)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Naming toggle: 年月日时分秒 vs 原名称 */}
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useYmdhmsName}
                        onChange={(e) => handleToggleNaming(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span>{lang === 'zh' ? '按年月日时分秒命名' : 'Format as Year-Month-Day-Hour-Minute-Second'}</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {useYmdhmsName ? (lang === 'zh' ? '当前：年月日时分秒' : 'YYYYMMDDHHmmss') : (lang === 'zh' ? '当前：原文件名' : 'Original name')}
                    </span>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {uploadError && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl p-2.5 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-450 animate-fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <p className="truncate">{uploadError}</p>
                </div>
              )}

              {/* Upload Button */}
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                  uploading
                    ? 'bg-slate-400 text-white cursor-not-allowed'
                    : !selectedFile
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-slate-900 hover:bg-black text-white dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400'
                }`}
              >
                {uploading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>{lang === 'zh' ? '正在上传...' : 'Uploading...'}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    <span>{lang === 'zh' ? '上传图片并获取 CDN 链接' : 'Upload & Get CDN Link'}</span>
                  </>
                )}
              </button>

            </div>
          )}

        </div>
      </div>

      {/* Pure Image Lightbox Modal */}
      {showBigPreview && createPortal(
        <div
          onClick={() => setShowBigPreview(false)}
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in cursor-zoom-out select-none"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setShowBigPreview(false)}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 sm:p-2.5 rounded-full transition-colors cursor-pointer z-10"
            title={lang === 'zh' ? '关闭大图' : 'Close'}
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          {/* Pure Image */}
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="relative max-h-full max-w-full flex items-center justify-center cursor-default"
          >
            <img
              src={filePreview || currentCdnUrl}
              alt={uploadSuccessResult?.uploadedName || 'Preview'}
              className="max-h-[92vh] max-w-[92vw] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
