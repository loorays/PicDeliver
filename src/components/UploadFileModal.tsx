/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileUp,
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
  HelpCircle,
  Trash2,
  ChevronDown,
  Maximize2,
  WrapText,
  Sparkles,
  FileJson,
  Music,
  Film,
  Archive,
  Type,
  Globe,
  BookOpen,
  Palette,
  Cpu,
  FileSpreadsheet,
  Settings2,
} from 'lucide-react';
import { GitHubRepoInfo, CDNType, CDNNode } from '../types';
import {
  parseGitHubUrl,
  buildCdnUrl,
  formatBytes,
  ALLOWED_FILE_CATEGORIES,
  ALLOWED_FILE_EXTENSIONS,
  getFileExtension,
  isAllowedUploadFile,
  isTextViewableFile,
  isImageFile,
  isAudioFile,
  isVideoFile,
} from '../utils';
import { fetchRepoDirectories, uploadFileToGitHub } from '../githubApi';
import { translations, Language } from '../translations';

interface UploadFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  selectedCdn: CDNType;
  dynamicCdns: CDNNode[];
  onSelectCdn: (cdn: CDNType) => void;
  initialRepoInfo: GitHubRepoInfo | null;
  initialToken: string;
  onTokenSave: (token: string) => void;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB single-file upload limit
const MAX_BINARY_TEXT_PREVIEW_BYTES = 64 * 1024; // 64KB cap for forced binary text inspection

const COMMIT_EMOJIS = [
  '📦', '🚀', '✨', '📄', '⚡', '🔧', '🧩', '📁', '💎', '🎯',
  '🌟', '🛠️', '📜', '🔖', '⚙️', '💡'
];

const getRandomCommitEmoji = () => {
  return COMMIT_EMOJIS[Math.floor(Math.random() * COMMIT_EMOJIS.length)];
};

export default function UploadFileModal({
  isOpen,
  onClose,
  lang,
  selectedCdn,
  dynamicCdns,
  onSelectCdn,
  initialRepoInfo,
  initialToken,
  onTokenSave,
}: UploadFileModalProps) {
  const t = translations[lang];

  // Repository input & configuration
  const [repoInput, setRepoInput] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState(initialToken);
  const [showToken, setShowToken] = useState(false);

  // Folder configuration
  const [folderMode, setFolderMode] = useState<'select' | 'create'>('select');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState<string>('assets');
  const [existingFolders, setExistingFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // File selection (strictly single file)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [overwriteIfExists, setOverwriteIfExists] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showAllowedFormats, setShowAllowedFormats] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local media preview URL (for image/audio/video)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);

  // Text content states
  const [textContent, setTextContent] = useState<string | null>(null);
  const [formattedJsonContent, setFormattedJsonContent] = useState<string | null>(null);
  const [isJsonPrettified, setIsJsonPrettified] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showPreUploadText, setShowPreUploadText] = useState(false);
  const [fetchingCdnText, setFetchingCdnText] = useState(false);
  const [cdnFetchNotice, setCdnFetchNotice] = useState<string | null>(null);
  const [forcedBinaryText, setForcedBinaryText] = useState(false);

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

  // Recent repository inputs history
  const [showHistory, setShowHistory] = useState(false);
  const [recentRepos, setRecentRepos] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('gh_recent_upload_repos');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });
  const historyRef = useRef<HTMLDivElement>(null);

  const saveToRecentRepos = (repoStr: string) => {
    const trimmed = repoStr.trim();
    if (!trimmed) return;
    setRecentRepos((prev) => {
      const updated = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 8);
      try {
        localStorage.setItem('gh_recent_upload_repos', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const clearRecentRepos = () => {
    setRecentRepos([]);
    try {
      localStorage.removeItem('gh_recent_upload_repos');
    } catch (e) {
      console.error(e);
    }
  };

  const removeRecentRepo = (itemToRemove: string) => {
    setRecentRepos((prev) => {
      const updated = prev.filter((item) => item !== itemToRemove);
      try {
        localStorage.setItem('gh_recent_upload_repos', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  // Close history dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    if (showHistory) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showHistory]);

  // Close text viewer overlay or modal on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showTextModal) {
          setShowTextModal(false);
        } else if (!uploading) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showTextModal, uploading, onClose]);

  // Cleanup object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (mediaPreviewUrl && mediaPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(mediaPreviewUrl);
      }
    };
  }, [mediaPreviewUrl]);

  // Prepopulate repoInput and sync token when opening
  useEffect(() => {
    if (isOpen) {
      if (initialRepoInfo) {
        const full = `${initialRepoInfo.owner}/${initialRepoInfo.repo}`;
        setRepoInput(full);
        saveToRecentRepos(full);
        if (initialRepoInfo.branch) {
          setBranch(initialRepoInfo.branch);
        }
        if (initialRepoInfo.path) {
          setSelectedFolder(initialRepoInfo.path);
        }
      }
      setToken(initialToken || '');
    }
  }, [isOpen, initialRepoInfo, initialToken]);

  const parseRepo = (): { owner: string; repo: string } | null => {
    if (!repoInput.trim()) return null;
    const parsed = parseGitHubUrl(repoInput.trim());
    if (parsed && parsed.owner && parsed.repo) {
      return { owner: parsed.owner, repo: parsed.repo };
    }
    return null;
  };

  const loadFolders = async () => {
    const repoData = parseRepo();
    if (!repoData) return;
    setLoadingFolders(true);
    try {
      const dirs = await fetchRepoDirectories(repoData.owner, repoData.repo, branch.trim() || 'main', token);
      setExistingFolders(dirs);
      setSelectedFolder(prev => (prev && !dirs.includes(prev) ? '' : prev));
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

  const handleClearFile = () => {
    if (mediaPreviewUrl && mediaPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }
    setSelectedFile(null);
    setMediaPreviewUrl(null);
    setFileName('');
    setTextContent(null);
    setFormattedJsonContent(null);
    setIsJsonPrettified(false);
    setShowPreUploadText(false);
    setShowTextModal(false);
    setForcedBinaryText(false);
    setCdnFetchNotice(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Strictly single file check
    if (files.length > 1) {
      setUploadError(
        lang === 'zh'
          ? '每次只能上传单个文件，请重新选择 1 个文件。'
          : 'Only a single file can be uploaded at a time. Please select 1 file.'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const file = files[0];
    const ext = getFileExtension(file.name);

    // Strictly whitelist extension check (reject image extensions and direct user to Upload Image)
    if (!isAllowedUploadFile(file.name)) {
      if (isImageFile(file.name)) {
        setUploadError(
          lang === 'zh'
            ? `图片格式 (${ext}) 请使用「上传图片」按钮上传，当前仅支持非图片文件。`
            : `Image files (${ext}) should be uploaded via the "Upload Image" button.`
        );
      } else {
        setUploadError(
          lang === 'zh'
            ? `不支持的文件格式 (${ext || '无扩展名'})。请仅上传允许列表中的文件类型。`
            : `Unsupported file format (${ext || 'no extension'}). Please select an allowed file type.`
        );
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(
        lang === 'zh'
          ? `文件体积 (${formatBytes(file.size)}) 超过 10MB 上传限制。`
          : `File size (${formatBytes(file.size)}) exceeds the 10MB limit.`
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Clear previous state cleanly
    if (mediaPreviewUrl && mediaPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }

    setSelectedFile(file);
    setFileName(file.name);
    setUploadError(null);
    setForcedBinaryText(false);
    setCdnFetchNotice(null);
    setIsJsonPrettified(false);
    setFormattedJsonContent(null);

    if (isAudioFile(file.name) || isVideoFile(file.name)) {
      setMediaPreviewUrl(URL.createObjectURL(file));
    } else {
      setMediaPreviewUrl(null);
    }

    if (isTextViewableFile(file.name)) {
      try {
        const content = await file.text();
        setTextContent(content);
        if (ext === '.json' || ext === '.map') {
          try {
            const parsed = JSON.parse(content);
            setFormattedJsonContent(JSON.stringify(parsed, null, 2));
          } catch {
            setFormattedJsonContent(null);
          }
        }
      } catch {
        setTextContent(null);
      }
    } else {
      setTextContent(null);
    }
  };

  const handleForceBinaryTextPreview = async () => {
    if (!selectedFile) return;
    try {
      const slice = selectedFile.slice(0, MAX_BINARY_TEXT_PREVIEW_BYTES);
      const buffer = await slice.arrayBuffer();
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const decoded = decoder.decode(buffer);
      setTextContent(decoded);
      setForcedBinaryText(true);
    } catch {
      setTextContent('');
    }
  };

  const handleTokenChange = (val: string) => {
    setToken(val);
    onTokenSave(val);
  };

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
      setUploadError(lang === 'zh' ? '请选择一个要上传的文件。' : 'Please select a file to upload.');
      return;
    }

    const finalFileName = fileName.trim() || selectedFile.name;
    if (!isAllowedUploadFile(finalFileName)) {
      const ext = getFileExtension(finalFileName);
      setUploadError(
        lang === 'zh'
          ? `目标文件名扩展名 (${ext || '无'}) 不在允许上传的格式范围内。`
          : `Target filename extension (${ext || 'none'}) is not in the allowed file list.`
      );
      return;
    }

    const targetFolder = folderMode === 'select' ? selectedFolder : newFolderName.trim().replace(/^\/+|\/+$/g, '');
    const dirDisplayName = targetFolder || (lang === 'zh' ? '根' : 'root');

    if (repoInput.trim()) {
      saveToRecentRepos(repoInput.trim());
    }

    setUploading(true);

    try {
      const emoji = getRandomCommitEmoji();
      const commitMessage = `${emoji} ${overwriteIfExists ? '更新' : '上传'}了 ${dirDisplayName}/${finalFileName}`;

      const result = await uploadFileToGitHub({
        owner: repoData.owner,
        repo: repoData.repo,
        branch: branch.trim() || 'main',
        folderPath: targetFolder,
        fileName: finalFileName,
        file: selectedFile,
        token: token.trim(),
        commitMessage,
        overwrite: overwriteIfExists,
      });

      setUploadSuccessResult({
        filePath: result.path,
        sha: result.sha,
        size: result.size,
        downloadUrl: result.downloadUrl,
        htmlUrl: result.htmlUrl,
        uploadedName: finalFileName,
      });
    } catch (err: any) {
      console.error(err);
      if (err.message === 'MISSING_TOKEN') setUploadError(t.uploadErrNoToken);
      else if (err.message === 'TOKEN_INVALID') setUploadError(t.uploadErrTokenInvalid);
      else if (err.message === 'TOKEN_NO_PERMISSION') setUploadError(t.uploadErrTokenPermission);
      else if (err.message === 'REPO_OR_BRANCH_NOT_FOUND') setUploadError(t.uploadErrNotFound);
      else if (err.message === 'FILE_ALREADY_EXISTS') {
        setUploadError(
          lang === 'zh'
            ? '该目录下已存在同名文件，请修改文件名，或勾选下方「同名文件覆盖更新」。'
            : 'A file with this name already exists. Rename the file or enable Overwrite.'
        );
      } else {
        setUploadError(err.message || (lang === 'zh' ? '上传失败，请检查设置' : 'Upload failed'));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleResetForNext = () => {
    handleClearFile();
    setUploadSuccessResult(null);
  };

  // Active CDN node & generated URL
  const activeNode = dynamicCdns.find((n) => n.id === selectedCdn) || dynamicCdns[0];
  const repoData = parseRepo();
  const currentCdnUrl =
    uploadSuccessResult && repoData && activeNode
      ? buildCdnUrl(activeNode.prefix, repoData.owner, repoData.repo, branch.trim() || 'main', uploadSuccessResult.filePath)
      : '';

  const handleFetchTextFromCdn = async () => {
    if (!currentCdnUrl) return;
    setFetchingCdnText(true);
    setCdnFetchNotice(null);
    try {
      const res = await fetch(currentCdnUrl, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const fetchedText = await res.text();
      setTextContent(fetchedText);
      const ext = getFileExtension(uploadSuccessResult?.uploadedName || '');
      if (ext === '.json' || ext === '.map') {
        try {
          setFormattedJsonContent(JSON.stringify(JSON.parse(fetchedText), null, 2));
        } catch {
          setFormattedJsonContent(null);
        }
      }
      setCdnFetchNotice(
        lang === 'zh'
          ? `已从 ${activeNode.name} 实时拉取最新文本内容`
          : `Fetched live text from ${activeNode.name}`
      );
      setTimeout(() => setCdnFetchNotice(null), 3000);
    } catch {
      setCdnFetchNotice(
        lang === 'zh'
          ? 'CDN 节点正在同步新文件（通常需几秒），当前显示本地提交内容'
          : 'CDN edge cache is warming up; showing uploaded local text'
      );
      setTimeout(() => setCdnFetchNotice(null), 4000);
    } finally {
      setFetchingCdnText(false);
    }
  };

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 1800);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  // Render contextual icon for file extension
  const renderFileTypeIcon = (filename: string, className = 'h-5 w-5') => {
    const ext = getFileExtension(filename);
    if (['.json', '.map'].includes(ext)) return <FileJson className={`${className} text-amber-500`} />;
    if (['.js', '.mjs', '.cjs', '.css', '.scss', '.less', '.html', '.htm', '.wasm'].includes(ext)) {
      return <FileCode className={`${className} text-sky-500`} />;
    }
    if (isAudioFile(filename)) return <Music className={`${className} text-violet-500`} />;
    if (isVideoFile(filename)) return <Film className={`${className} text-rose-500`} />;
    if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return <Type className={`${className} text-indigo-500`} />;
    if (['.zip', '.gz', '.br'].includes(ext)) return <Archive className={`${className} text-orange-500`} />;
    return <FileText className={`${className} text-slate-500`} />;
  };

  // Adaptive icon + color + extension badge specifically for the selected file icon box
  const getFileIconBadge = (filename: string) => {
    const ext = getFileExtension(filename);
    const label = (ext.replace('.', '') || 'FILE').toUpperCase();

    if (['.js', '.mjs', '.cjs'].includes(ext)) {
      return {
        Icon: FileCode,
        label,
        boxClass: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/90 dark:border-amber-800/60 text-amber-600 dark:text-amber-400',
      };
    }
    if (ext === '.css') {
      return {
        Icon: Palette,
        label,
        boxClass: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200/90 dark:border-sky-800/60 text-sky-600 dark:text-sky-400',
      };
    }
    if (['.scss', '.less'].includes(ext)) {
      return {
        Icon: Palette,
        label,
        boxClass: 'bg-pink-50 dark:bg-pink-950/40 border-pink-200/90 dark:border-pink-800/60 text-pink-600 dark:text-pink-400',
      };
    }
    if (['.json', '.map'].includes(ext)) {
      return {
        Icon: FileJson,
        label,
        boxClass: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200/90 dark:border-orange-800/60 text-orange-600 dark:text-orange-400',
      };
    }
    if (['.html', '.htm'].includes(ext)) {
      return {
        Icon: Globe,
        label,
        boxClass: 'bg-red-50 dark:bg-red-950/40 border-red-200/90 dark:border-red-800/60 text-red-600 dark:text-red-400',
      };
    }
    if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
      return {
        Icon: Type,
        label,
        boxClass: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/90 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400',
      };
    }
    if (isAudioFile(filename)) {
      return {
        Icon: Music,
        label,
        boxClass: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200/90 dark:border-violet-800/60 text-violet-600 dark:text-violet-400',
      };
    }
    if (isVideoFile(filename)) {
      return {
        Icon: Film,
        label,
        boxClass: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200/90 dark:border-rose-800/60 text-rose-600 dark:text-rose-400',
      };
    }
    if (ext === '.pdf') {
      return {
        Icon: FileText,
        label,
        boxClass: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200/90 dark:border-rose-800/60 text-rose-600 dark:text-rose-400',
      };
    }
    if (ext === '.md') {
      return {
        Icon: BookOpen,
        label,
        boxClass: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200/90 dark:border-blue-800/60 text-blue-600 dark:text-blue-400',
      };
    }
    if (['.csv', '.tsv'].includes(ext)) {
      return {
        Icon: FileSpreadsheet,
        label,
        boxClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/90 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400',
      };
    }
    if (['.xml', '.yaml', '.yml', '.toml'].includes(ext)) {
      return {
        Icon: Settings2,
        label,
        boxClass: 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200/90 dark:border-cyan-800/60 text-cyan-600 dark:text-cyan-400',
      };
    }
    if (ext === '.wasm') {
      return {
        Icon: Cpu,
        label,
        boxClass: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200/90 dark:border-purple-800/60 text-purple-600 dark:text-purple-400',
      };
    }
    if (['.zip', '.gz', '.br'].includes(ext)) {
      return {
        Icon: Archive,
        label,
        boxClass: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/90 dark:border-amber-800/60 text-amber-700 dark:text-amber-400',
      };
    }
    return {
      Icon: FileText,
      label,
      boxClass: 'bg-slate-100 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
    };
  };

  // Determine snippet buttons based on file extension
  const getContextualSnippets = (name: string, url: string) => {
    const ext = getFileExtension(name);
    if (['.js', '.mjs', '.cjs'].includes(ext)) {
      return [
        { id: 'script', label: '<script>', code: `<script src="${url}"></script>`, icon: Code },
        { id: 'esm', label: 'ESM import', code: `import "${url}";`, icon: FileCode },
        { id: 'md', label: 'Markdown', code: `[${name}](${url})`, icon: LinkIcon },
      ];
    }
    if (['.css', '.scss', '.less'].includes(ext)) {
      return [
        { id: 'link', label: '<link>', code: `<link rel="stylesheet" href="${url}" />`, icon: Code },
        { id: 'import', label: '@import', code: `@import url("${url}");`, icon: FileCode },
        { id: 'md', label: 'Markdown', code: `[${name}](${url})`, icon: LinkIcon },
      ];
    }
    if (isAudioFile(name)) {
      return [
        { id: 'html', label: '<audio>', code: `<audio controls src="${url}"></audio>`, icon: Code },
        { id: 'md', label: 'Markdown', code: `[${name}](${url})`, icon: LinkIcon },
        { id: 'url', label: 'Raw URL', code: url, icon: Globe },
      ];
    }
    if (isVideoFile(name)) {
      return [
        { id: 'html', label: '<video>', code: `<video controls src="${url}"></video>`, icon: Code },
        { id: 'md', label: 'Markdown', code: `[${name}](${url})`, icon: LinkIcon },
        { id: 'url', label: 'Raw URL', code: url, icon: Globe },
      ];
    }
    if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
      const fontName = name.replace(/\.[^.]+$/, '') || 'CustomFont';
      return [
        { id: 'css', label: '@font-face', code: `@font-face {\n  font-family: '${fontName}';\n  src: url('${url}');\n}`, icon: Code },
        { id: 'preload', label: '<link preload>', code: `<link rel="preload" href="${url}" as="font" crossorigin />`, icon: FileCode },
        { id: 'md', label: 'Markdown', code: `[${name}](${url})`, icon: LinkIcon },
      ];
    }
    if (['.json', '.map', '.txt', '.md', '.xml', '.yaml', '.yml', '.csv', '.tsv', '.toml'].includes(ext)) {
      return [
        { id: 'fetch', label: 'fetch()', code: `fetch("${url}").then(res => res.${ext === '.json' ? 'json()' : 'text()'})`, icon: FileCode },
        { id: 'curl', label: 'curl', code: `curl -L "${url}"`, icon: Code },
        { id: 'md', label: 'Markdown', code: `[${name}](${url})`, icon: LinkIcon },
      ];
    }
    return [
      { id: 'html', label: 'HTML <a>', code: `<a href="${url}" target="_blank">${name}</a>`, icon: Code },
      { id: 'md', label: 'Markdown', code: `[${name}](${url})`, icon: LinkIcon },
      { id: 'curl', label: 'curl', code: `curl -LO "${url}"`, icon: FileCode },
    ];
  };

  const activeDisplayedText =
    isJsonPrettified && formattedJsonContent !== null ? formattedJsonContent : textContent;

  const textLines = activeDisplayedText !== null ? activeDisplayedText.split(/\r?\n/) : [];
  const uploadedOrSelectedName = uploadSuccessResult?.uploadedName || fileName || selectedFile?.name || '';
  const uploadedExt = getFileExtension(uploadedOrSelectedName);
  const isCurrentTextFile = isTextViewableFile(uploadedOrSelectedName);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div
        className="bg-white dark:bg-[#151E33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileUp className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {uploadSuccessResult
                ? (lang === 'zh' ? '文件上传成功 · CDN 加速链接已就绪' : 'File Uploaded · CDN Link Ready')
                : (lang === 'zh' ? '上传受限静态文件到 GitHub' : 'Upload Static File to GitHub')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {uploadSuccessResult ? (
            /* ================= SUCCESS VIEW ================= */
            <div className="space-y-4 animate-fade-in">
              {/* File Summary Card */}
              <div className="flex items-center gap-3.5 bg-slate-50 dark:bg-[#090D16] p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="h-12 w-12 rounded-xl bg-white dark:bg-[#151E33] border border-slate-200/70 dark:border-slate-800 flex items-center justify-center shrink-0">
                  {renderFileTypeIcon(uploadSuccessResult.uploadedName, 'h-6 w-6')}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {uploadSuccessResult.filePath}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1 font-mono">
                    <span>{formatBytes(uploadSuccessResult.size)}</span>
                    <span>·</span>
                    <span className="uppercase bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      {uploadedExt.replace('.', '') || 'FILE'}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {branch.trim() || 'main'}
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

              {/* CDN Node Switcher Pills */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-bold">
                    {lang === 'zh' ? '切换 CDN 加速节点' : 'Switch CDN Acceleration Node'}
                  </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    {activeNode.name}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {dynamicCdns.map((node) => {
                    const active = node.id === activeNode.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => onSelectCdn(node.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-500 shadow-xs'
                            : 'bg-slate-50 dark:bg-[#090D16] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                        }`}
                      >
                        {node.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accelerated CDN Link Bar */}
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
                  title={lang === 'zh' ? '在新标签页打开 CDN 链接' : 'Open CDN link in new tab'}
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
                  <span>{copiedType === 'url' ? (lang === 'zh' ? '已复制' : 'Copied') : (lang === 'zh' ? '复制加速链接' : 'Copy CDN Link')}</span>
                </button>
              </div>

              {/* Contextual Quick Snippets */}
              <div className="grid grid-cols-3 gap-2">
                {getContextualSnippets(uploadSuccessResult.uploadedName, currentCdnUrl).map((snip) => {
                  const IconComp = snip.icon;
                  const isCopied = copiedType === snip.id;
                  return (
                    <button
                      key={snip.id}
                      type="button"
                      onClick={() => handleCopy(snip.code, snip.id)}
                      title={snip.code}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isCopied
                          ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600 dark:bg-emerald-950/20'
                          : 'bg-white dark:bg-[#090D16] border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <IconComp className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                      <span className="truncate">{isCopied ? (lang === 'zh' ? '已复制' : 'Copied') : snip.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Media Preview (Audio / Video) */}
              {isAudioFile(uploadSuccessResult.uploadedName) && mediaPreviewUrl && (
                <div className="bg-slate-50 dark:bg-[#090D16] border border-slate-200/80 dark:border-slate-800 rounded-xl p-3">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">
                    {lang === 'zh' ? '音频试听预览' : 'Audio Preview'}
                  </p>
                  <audio controls src={mediaPreviewUrl} className="w-full h-9" />
                </div>
              )}

              {isVideoFile(uploadSuccessResult.uploadedName) && mediaPreviewUrl && (
                <div className="bg-slate-50 dark:bg-[#090D16] border border-slate-200/80 dark:border-slate-800 rounded-xl p-3">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">
                    {lang === 'zh' ? '视频播放预览' : 'Video Preview'}
                  </p>
                  <video controls src={mediaPreviewUrl} className="w-full max-h-56 rounded-lg bg-black" />
                </div>
              )}

              {/* Text Content Viewer */}
              {(isCurrentTextFile || forcedBinaryText) && activeDisplayedText !== null ? (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-[#090D16]">
                  {/* Viewer Toolbar */}
                  <div className="px-3 py-2 bg-white dark:bg-[#111827] border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px]">
                      <FileText className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {lang === 'zh' ? '文本格式内容查看' : 'Text Content Viewer'}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {textLines.length} {lang === 'zh' ? '行' : 'lines'} · {activeDisplayedText.length} {lang === 'zh' ? '字符' : 'chars'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {formattedJsonContent !== null && (
                        <button
                          type="button"
                          onClick={() => setIsJsonPrettified(!isJsonPrettified)}
                          className={`px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                            isJsonPrettified
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50'
                              : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:border-slate-400'
                          }`}
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>{isJsonPrettified ? (lang === 'zh' ? '原始文本' : 'Raw') : (lang === 'zh' ? '格式化 JSON' : 'Format JSON')}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setWordWrap(!wordWrap)}
                        title={lang === 'zh' ? '切换自动换行' : 'Toggle Word Wrap'}
                        className={`px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                          wordWrap
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-700 dark:border-slate-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <WrapText className="h-3 w-3" />
                        <span>{lang === 'zh' ? '换行' : 'Wrap'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleFetchTextFromCdn}
                        disabled={fetchingCdnText}
                        title={lang === 'zh' ? '尝试从 CDN 链接实时读取内容' : 'Fetch live text from CDN URL'}
                        className="px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer border bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:border-slate-400 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${fetchingCdnText ? 'animate-spin' : ''}`} />
                        <span>{lang === 'zh' ? '从 CDN 读取' : 'Fetch CDN'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(activeDisplayedText, 'text')}
                        className={`px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                          copiedType === 'text'
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {copiedType === 'text' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedType === 'text' ? (lang === 'zh' ? '已复制' : 'Copied') : (lang === 'zh' ? '复制文本' : 'Copy Text')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowTextModal(true)}
                        title={lang === 'zh' ? '全屏大窗口阅读文本内容' : 'Expand full-screen text viewer'}
                        className="p-1 rounded-lg border bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:border-slate-400 cursor-pointer"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {cdnFetchNotice && (
                    <div className="px-3 py-1.5 bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/40 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{cdnFetchNotice}</span>
                    </div>
                  )}

                  {forcedBinaryText && (
                    <div className="px-3 py-1.5 bg-amber-50/70 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/40 text-[11px] text-amber-700 dark:text-amber-300">
                      {lang === 'zh'
                        ? '提示：当前文件为二进制/压缩格式，仅截取前 64KB 按 UTF-8 解码展示，可能包含乱码字符。'
                        : 'Note: Binary file decoded as UTF-8 (first 64KB shown).'}
                    </div>
                  )}

                  {/* Code / Text Content Area with Line Numbers */}
                  <div className="max-h-56 overflow-auto font-mono text-[11.5px] leading-relaxed bg-white dark:bg-[#090D16] text-slate-800 dark:text-slate-200">
                    {activeDisplayedText.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 italic">
                        {lang === 'zh' ? '(空文件，无文本内容)' : '(Empty file)'}
                      </div>
                    ) : (
                      <table className="w-full border-collapse">
                        <tbody>
                          {textLines.slice(0, 500).map((line, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                              <td className="select-none text-right pr-3 pl-2.5 py-0.5 text-[10.5px] text-slate-400 dark:text-slate-600 border-r border-slate-100 dark:border-slate-800/70 w-10 align-top">
                                {idx + 1}
                              </td>
                              <td className={`pl-3 pr-3 py-0.5 align-top ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
                                {line || ' '}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {textLines.length > 500 && (
                      <div className="px-3 py-2 text-center border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#111827]">
                        <button
                          type="button"
                          onClick={() => setShowTextModal(true)}
                          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          {lang === 'zh'
                            ? `仅预览前 500 行（共 ${textLines.length} 行），点击全屏查看全部内容`
                            : `Showing first 500 of ${textLines.length} lines — click to view all`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Non-text binary file notice with optional force text preview */
                <div className="bg-slate-50 dark:bg-[#090D16] border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'zh'
                      ? `该文件 (${uploadedExt || 'binary'}) 为媒体或二进制格式，可直接复制上方 CDN 链接引用或下载。`
                      : `This file (${uploadedExt || 'binary'}) is a media/binary asset. Use the CDN link above to embed or download.`}
                  </div>
                  <button
                    type="button"
                    onClick={handleForceBinaryTextPreview}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E33] text-slate-600 dark:text-slate-300 hover:border-slate-400 shrink-0 cursor-pointer"
                  >
                    {lang === 'zh' ? '尝试以文本查看' : 'View as Text'}
                  </button>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {lang === 'zh' ? '文件已成功提交到 GitHub 仓库' : 'Committed to GitHub repository'}
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
                    <span>{lang === 'zh' ? '继续上传文件' : 'Upload Another'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ================= UPLOAD FORM ================= */
            <div className="space-y-3.5">
              {/* Row 1: Repo + Branch */}
              <div className="flex gap-2">
                <div ref={historyRef} className="relative flex-1">
                  <Github className="h-4 w-4 text-slate-400 absolute left-3 top-2.5 z-10 pointer-events-none" />
                  <input
                    type="text"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="owner/repo"
                    className="w-full bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-9 pr-9 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-slate-400"
                  />

                  <div className="absolute right-2.5 top-2 flex items-center gap-1 z-10">
                    <button
                      type="button"
                      onClick={() => setShowHistory(!showHistory)}
                      title={lang === 'zh' ? '查看最近输入内容' : 'Recent inputs'}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-md transition-colors cursor-pointer"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showHistory ? 'rotate-180 text-slate-700 dark:text-slate-200' : ''}`} />
                    </button>
                  </div>

                  {showHistory && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white dark:bg-[#151E33] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden py-1 animate-fade-in font-sans">
                      <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          {lang === 'zh' ? '最近输入' : 'Recent Inputs'}
                        </span>
                        {recentRepos.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearRecentRepos();
                            }}
                            title={lang === 'zh' ? '清除全部最近输入内容' : 'Clear all recent inputs'}
                            className="flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-1.5 py-0.5 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>{lang === 'zh' ? '清除' : 'Clear'}</span>
                          </button>
                        )}
                      </div>

                      {recentRepos.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto py-0.5">
                          {recentRepos.map((item, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                setRepoInput(item);
                                setShowHistory(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between gap-2 transition-colors cursor-pointer group/history"
                            >
                              <span className="truncate">{item}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {repoInput.trim() === item && (
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeRecentRepo(item);
                                  }}
                                  title={lang === 'zh' ? '删除此条记录' : 'Remove this item'}
                                  className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer opacity-75 group-hover/history:opacity-100"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-4 text-center text-[11px] text-slate-400 dark:text-slate-500">
                          {lang === 'zh' ? '暂无最近输入记录' : 'No recent inputs yet'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative w-28 sm:w-32">
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
                    placeholder="assets/js"
                    className="flex-1 min-w-0 w-full bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-slate-400"
                  />
                )}
              </div>

              {/* Row 4: Single File Picker / Preview */}
              <input
                type="file"
                ref={fileInputRef}
                accept={ALLOWED_FILE_EXTENSIONS.join(',')}
                multiple={false}
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files)}
              />

              {!selectedFile ? (
                <div className="space-y-2.5">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      handleFileChange(e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl py-6 px-4 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-emerald-500 bg-emerald-50/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-[#090D16]/40'
                    }`}
                  >
                    <FileUp className="h-6 w-6 text-slate-400 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      {lang === 'zh' ? '点击或拖拽单个受限文件到此区域' : 'Click or drag a single allowed file here'}
                    </p>
                    <p className="text-[10.5px] text-slate-400 dark:text-slate-500 mt-1">
                      {lang === 'zh'
                        ? '仅限上传单个文件（最大 10MB）· 支持 JSON、JS、CSS、字体、音视频及文档等'
                        : 'Single file only (max 10MB) · Supports JSON, JS, CSS, fonts, media, docs & archives'}
                    </p>
                  </div>

                  {/* Collapsible Allowed Extensions Reference */}
                  <div className="bg-slate-50/70 dark:bg-[#090D16]/70 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowAllowedFormats(!showAllowedFormats)}
                      className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <span>
                        {lang === 'zh'
                          ? `查看允许上传的文件格式 (${ALLOWED_FILE_EXTENSIONS.length} 种)`
                          : `View Allowed File Extensions (${ALLOWED_FILE_EXTENSIONS.length})`}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showAllowedFormats ? 'rotate-180' : ''}`} />
                    </button>

                    {showAllowedFormats && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-200/50 dark:border-slate-800/80 space-y-2 animate-fade-in">
                        {ALLOWED_FILE_CATEGORIES.map((cat) => (
                          <div key={cat.key} className="flex flex-col sm:flex-row sm:items-start gap-1.5 text-[10.5px]">
                            <span className="font-bold text-slate-500 dark:text-slate-400 sm:w-28 shrink-0 pt-0.5">
                              {lang === 'zh' ? cat.labelZh : cat.labelEn}:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {cat.exts.map((ext) => (
                                <span
                                  key={ext}
                                  className="font-mono px-1.5 py-0.5 rounded bg-white dark:bg-[#151E33] border border-slate-200/70 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                                >
                                  {ext}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-[#090D16] p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const badge = getFileIconBadge(fileName.trim() || selectedFile.name);
                      const BadgeIcon = badge.Icon;
                      return (
                        <div className={`h-12 w-12 rounded-xl border flex flex-col items-center justify-center shrink-0 gap-0.5 transition-colors ${badge.boxClass}`}>
                          <BadgeIcon className="h-4.5 w-4.5" />
                          <span className="text-[8px] font-mono font-extrabold uppercase leading-none tracking-tight max-w-[42px] truncate">
                            {badge.label}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={fileName}
                          onChange={(e) => setFileName(e.target.value)}
                          className="w-full bg-white dark:bg-[#151E33] border border-slate-200 dark:border-slate-800 rounded-lg py-1 px-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-slate-400 truncate"
                          title={lang === 'zh' ? '可编辑保存的文件名' : 'Edit target filename'}
                        />
                        <button
                          type="button"
                          onClick={handleClearFile}
                          className="text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0 ml-1 flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{lang === 'zh' ? '清除' : 'Clear'}</span>
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1 font-mono">
                        <span>{formatBytes(selectedFile.size)}</span>
                        <span>·</span>
                        <span className={isTextViewableFile(selectedFile.name) ? 'text-emerald-600 dark:text-emerald-400 font-sans font-semibold' : 'font-sans'}>
                          {isTextViewableFile(selectedFile.name)
                            ? (lang === 'zh' ? '支持文本内容查看' : 'Text viewable')
                            : (lang === 'zh' ? '二进制 / 媒体文件' : 'Binary / Media')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pre-upload controls: Overwrite toggle & Pre-upload Text Preview button */}
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={overwriteIfExists}
                        onChange={(e) => setOverwriteIfExists(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span>{lang === 'zh' ? '若同名文件已存在则直接覆盖更新' : 'Overwrite existing file if same name'}</span>
                    </label>

                    {isTextViewableFile(selectedFile.name) && textContent !== null && (
                      <button
                        type="button"
                        onClick={() => setShowPreUploadText(!showPreUploadText)}
                        className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>{showPreUploadText ? (lang === 'zh' ? '收起文本预览' : 'Hide Text') : (lang === 'zh' ? '查看文本内容' : 'View Text Content')}</span>
                      </button>
                    )}
                  </div>

                  {/* Pre-upload inline text preview */}
                  {showPreUploadText && activeDisplayedText !== null && (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#151E33]">
                      <div className="px-2.5 py-1.5 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-[10.5px]">
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {textLines.length} {lang === 'zh' ? '行' : 'lines'} · {activeDisplayedText.length} {lang === 'zh' ? '字符' : 'chars'}
                        </span>
                        <div className="flex items-center gap-2">
                          {formattedJsonContent !== null && (
                            <button
                              type="button"
                              onClick={() => setIsJsonPrettified(!isJsonPrettified)}
                              className="font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                            >
                              {isJsonPrettified ? (lang === 'zh' ? '原始' : 'Raw') : (lang === 'zh' ? '格式化 JSON' : 'Format JSON')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowTextModal(true)}
                            className="font-bold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer flex items-center gap-0.5"
                          >
                            <Maximize2 className="h-3 w-3" />
                            <span>{lang === 'zh' ? '全屏' : 'Expand'}</span>
                          </button>
                        </div>
                      </div>
                      <pre className="p-2.5 max-h-40 overflow-auto font-mono text-[11px] leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
                        {activeDisplayedText.slice(0, 10000)}
                        {activeDisplayedText.length > 10000 ? '\n... (click Expand to view full content)' : ''}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Error Alert */}
              {uploadError && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl p-2.5 flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 animate-fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                  <p className="leading-relaxed">{uploadError}</p>
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
                    <span>{lang === 'zh' ? '正在上传文件到 GitHub...' : 'Uploading file...'}</span>
                  </>
                ) : (
                  <>
                    <FileUp className="h-3.5 w-3.5" />
                    <span>{lang === 'zh' ? '上传文件并获取加速链接' : 'Upload File & Get CDN Link'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen Text Content Viewer Modal */}
      {showTextModal && activeDisplayedText !== null && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in"
          onClick={() => setShowTextModal(false)}
        >
          <div
            className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-[#111827]">
              <div className="flex items-center gap-2 min-w-0">
                {renderFileTypeIcon(uploadedOrSelectedName, 'h-4.5 w-4.5 shrink-0')}
                <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {uploadedOrSelectedName}
                </span>
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                  ({textLines.length} {lang === 'zh' ? '行' : 'lines'})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {formattedJsonContent !== null && (
                  <button
                    type="button"
                    onClick={() => setIsJsonPrettified(!isJsonPrettified)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                      isJsonPrettified
                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50'
                        : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>{isJsonPrettified ? (lang === 'zh' ? '原始文本' : 'Raw') : (lang === 'zh' ? '格式化 JSON' : 'Format JSON')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setWordWrap(!wordWrap)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                    wordWrap
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-700 dark:border-slate-600'
                      : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}
                >
                  <WrapText className="h-3 w-3" />
                  <span>{lang === 'zh' ? '自动换行' : 'Wrap'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopy(activeDisplayedText, 'modal-text')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                    copiedType === 'modal-text'
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}
                >
                  {copiedType === 'modal-text' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedType === 'modal-text' ? (lang === 'zh' ? '已复制' : 'Copied') : (lang === 'zh' ? '复制全文' : 'Copy All')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTextModal(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Full Content */}
            <div className="flex-1 overflow-auto font-mono text-xs leading-relaxed bg-white dark:bg-[#090D16] text-slate-800 dark:text-slate-200">
              {activeDisplayedText.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 italic">
                  {lang === 'zh' ? '(空文件，无文本内容)' : '(Empty file)'}
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {textLines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                        <td className="select-none text-right pr-3.5 pl-3 py-0.5 text-[11px] text-slate-400 dark:text-slate-600 border-r border-slate-100 dark:border-slate-800/70 w-12 align-top">
                          {idx + 1}
                        </td>
                        <td className={`pl-3.5 pr-4 py-0.5 align-top ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
                          {line || ' '}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
