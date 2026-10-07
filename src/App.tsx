/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import GitHubConfigCard from './components/GitHubConfigCard';
import CDNSelector from './components/CDNSelector';
import ImageGrid from './components/ImageGrid';
import UploadModal from './components/UploadModal';
import { GitHubRepoInfo, ImageItem, CDNType, ApiStatus, CDNNode } from './types';
import { CDN_NODES, buildCdnUrl, isImageFile } from './utils';
import { AlertCircle, ShieldAlert, Image as ImageIcon, Key, HelpCircle, Info, Globe, FolderDown, Upload } from 'lucide-react';
import { translations, Language } from './translations';

export default function App() {
  // Ensure default clean, high-contrast light theme is loaded
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // Localization choice state
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('gh_cdn_lang') as Language) || 'zh';
  });

  const t = translations[lang];

  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedCdn, setSelectedCdn] = useState<CDNType>('jsdmirror1');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  
  const [dynamicCdns, setDynamicCdns] = useState<CDNNode[]>(() => {
    const stored = localStorage.getItem('gh_custom_cdns');
    const baseNodes = [...CDN_NODES];
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return [...baseNodes, ...parsed];
        }
      } catch (e) {
        console.error(e);
      }
    }
    return baseNodes;
  });

  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    loading: false,
    error: null,
    rateLimitLimit: null,
    rateLimitRemaining: null
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem('gh_cdn_token') || '';
  });

  const [activeRepo, setActiveRepo] = useState<GitHubRepoInfo | null>(null);
  const [recursive, setRecursive] = useState(false);

  const handleAddCustomCdn = (name: string, prefix: string) => {
    const cleanPrefix = prefix.trim().replace(/\/+$/, '');
    const id = 'custom-' + Date.now();
    const newNode: CDNNode = {
      id,
      name,
      description: lang === 'zh' ? `自定义 CDN 线路：${cleanPrefix}` : `Custom CDN Node: ${cleanPrefix}`,
      prefix: cleanPrefix,
      speedTag: lang === 'zh' ? '自定义' : 'Custom',
      latencyIndicator: 'medium'
    };
    
    const updatedNodes = [...dynamicCdns, newNode];
    setDynamicCdns(updatedNodes);
    localStorage.setItem('gh_custom_cdns', JSON.stringify(updatedNodes.filter(n => n.id.startsWith('custom-'))));
    
    // Also re-generate active images cdn urls so they are instantly accessible
    if (images.length > 0 && activeRepo) {
      setImages(prevImages => prevImages.map(img => {
        const cdnUrls = { ...img.cdnUrls };
        cdnUrls[id] = buildCdnUrl(cleanPrefix, activeRepo.owner, activeRepo.repo, activeRepo.branch, img.path);
        return {
          ...img,
          cdnUrls
        };
      }));
    }
    
    setSelectedCdn(id);
  };

  const handleRemoveCustomCdn = (id: string) => {
    const updatedNodes = dynamicCdns.filter(n => n.id !== id);
    setDynamicCdns(updatedNodes);
    localStorage.setItem('gh_custom_cdns', JSON.stringify(updatedNodes.filter(n => n.id.startsWith('custom-'))));
    
    if (selectedCdn === id) {
      setSelectedCdn('jsdmirror1');
    }
  };

  const handleEditCustomCdn = (id: string, name: string, prefix: string) => {
    const cleanPrefix = prefix.trim().replace(/\/+$/, '');
    const updatedNodes = dynamicCdns.map(node => {
      if (node.id === id) {
        return {
          ...node,
          name,
          description: lang === 'zh' ? `自定义 CDN 线路：${cleanPrefix}` : `Custom CDN Node: ${cleanPrefix}`,
          prefix: cleanPrefix,
        };
      }
      return node;
    });
    setDynamicCdns(updatedNodes);
    localStorage.setItem('gh_custom_cdns', JSON.stringify(updatedNodes.filter(n => n.id.startsWith('custom-'))));

    // Update active images cdn urls instantly
    if (images.length > 0 && activeRepo) {
      setImages(prevImages => prevImages.map(img => {
        const cdnUrls = { ...img.cdnUrls };
        cdnUrls[id] = buildCdnUrl(cleanPrefix, activeRepo.owner, activeRepo.repo, activeRepo.branch, img.path);
        return {
          ...img,
          cdnUrls
        };
      }));
    }
  };

  // Sync CDN node name for descriptions
  const selectedCdnName = dynamicCdns.find(n => n.id === selectedCdn)?.name || 'Gcore 专属';

  const handleLanguageChange = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('gh_cdn_lang', newLang);
    document.documentElement.lang = newLang === 'zh' ? 'zh-CN' : 'en';
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const handleClearResults = () => {
    setImages([]);
    setActiveRepo(null);
    setApiStatus(prev => ({ ...prev, error: null }));
  };

  const handleImageUploaded = (newImage: ImageItem) => {
    setImages(prev => [newImage, ...prev.filter(item => item.path !== newImage.path)]);
    setApiStatus(prev => ({ ...prev, error: null }));
  };

  const handleTokenChange = (newToken: string) => {
    setToken(newToken);
    if (newToken.trim()) {
      localStorage.setItem('gh_cdn_token', newToken.trim());
    } else {
      localStorage.removeItem('gh_cdn_token');
    }
  };

  // Support global Ctrl+V pasting of images from clipboard
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // If upload modal is already open, it handles its own paste
      if (isUploadOpen) return;

      // Don't intercept if user is typing text into an input or textarea
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
            setPastedFile(file);
            setIsUploadOpen(true);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [isUploadOpen]);

  const executeFetch = async (repoInfo: GitHubRepoInfo, recursive: boolean, currentToken: string) => {
    setApiStatus(prev => ({ ...prev, loading: true, error: null }));
    setImages([]);
    setActiveRepo(repoInfo);

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json'
    };
    if (currentToken.trim()) {
      headers['Authorization'] = `token ${currentToken.trim()}`;
    }

    try {
      // 1. Resolve default branch if the parsed branch is empty or not explicit.
      let branchName = repoInfo.branch;
      
      // If no branch was explicit in path tree, look up the repo's default_branch
      if (!branchName) {
        try {
          const repoRes = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`, { headers });
          updateRateLimits(repoRes);
          
          if (repoRes.status === 404) {
            throw new Error(t.fetchRepoError);
          } else if (repoRes.status === 401 || repoRes.status === 403) {
            const detail = await repoRes.json().catch(() => ({}));
            const msg = detail.message || '';
            if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('limit exceeded')) {
              throw new Error('RATELIMIT_ERROR');
            }
          } else if (repoRes.ok) {
            const repoData = await repoRes.json();
            branchName = repoData.default_branch || 'main';
          }
        } catch (e: any) {
          if (e.message === 'RATELIMIT_ERROR' || e.message === t.fetchRepoError) throw e;
        }
        
        if (!branchName) {
          branchName = 'main';
        }
      }

      const cleanSubPath = (repoInfo.path || '').replace(/^\/+|\/+$/g, '');
      let parsedWithBranch = { ...repoInfo, branch: branchName, path: cleanSubPath };
      setActiveRepo(parsedWithBranch);

      let imageList: ImageItem[] = [];

      // Helper to fetch contents or tree for a given branch
      const fetchAttempt = async (targetBranch: string) => {
        if (recursive) {
          const treeUrl = `https://api.github.com/repos/${parsedWithBranch.owner}/${parsedWithBranch.repo}/git/trees/${targetBranch}?recursive=1`;
          const treeRes = await fetch(treeUrl, { headers });
          updateRateLimits(treeRes);
          return treeRes;
        } else {
          const contentsUrl = cleanSubPath 
            ? `https://api.github.com/repos/${parsedWithBranch.owner}/${parsedWithBranch.repo}/contents/${cleanSubPath}?ref=${targetBranch}`
            : `https://api.github.com/repos/${parsedWithBranch.owner}/${parsedWithBranch.repo}/contents?ref=${targetBranch}`;
          const contentsRes = await fetch(contentsUrl, { headers });
          updateRateLimits(contentsRes);
          return contentsRes;
        }
      };

      let activeRes = await fetchAttempt(branchName);

      // If 404 on the initial branch, automatically attempt common fallback branch (main <-> master)
      if (activeRes.status === 404) {
        const fallbackBranch = branchName === 'main' ? 'master' : branchName === 'master' ? 'main' : null;
        if (fallbackBranch) {
          const fbRes = await fetchAttempt(fallbackBranch);
          if (fbRes.ok) {
            branchName = fallbackBranch;
            parsedWithBranch = { ...parsedWithBranch, branch: fallbackBranch };
            setActiveRepo(parsedWithBranch);
            activeRes = fbRes;
          }
        }
      }

      // Check final response status
      if (activeRes.status === 404) {
        if (cleanSubPath) {
          throw new Error(
            lang === 'zh'
              ? `在分支「${branchName}」下未找到文件夹「${cleanSubPath}」。请检查文件夹拼写，或者清空路径以扫描整个仓库。`
              : `Folder "${cleanSubPath}" not found in branch "${branchName}". Please verify the folder name or clear the path to scan the full repo.`
          );
        } else {
          throw new Error(t.fetchFolderError);
        }
      } else if (activeRes.status === 401 || activeRes.status === 403) {
        const detail = await activeRes.json().catch(() => ({}));
        const msg = detail.message || '';
        if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('limit exceeded')) {
          throw new Error('RATELIMIT_ERROR');
        }
        throw new Error(`${t.fetchRepoError} (${activeRes.status})`);
      }

      if (!activeRes.ok) {
        throw new Error(t.fetchConnError);
      }

      const resData = await activeRes.json();

      if (recursive) {
        // --- RECURSIVE SCANNING ENGINE (Git Trees API) ---
        const files: any[] = resData.tree || [];
        const targetPrefix = cleanSubPath ? cleanSubPath + '/' : '';

        const matchedFiles = files.filter(file => {
          if (file.type !== 'blob') return false;
          if (targetPrefix && !file.path.startsWith(targetPrefix)) return false;
          return isImageFile(file.path);
        });

        imageList = matchedFiles.map(file => {
          const filename = file.path.split('/').pop() || file.path;
          return buildImageItem(
            filename,
            file.path,
            file.size || 0,
            file.sha,
            parsedWithBranch
          );
        });

      } else {
        // --- STANDARD SINGLE-LEVEL SCANNING ENGINE ---
        const files = Array.isArray(resData) ? resData : [resData];

        const matchedFiles = files.filter(file => 
          file.type === 'file' && isImageFile(file.name)
        );

        imageList = matchedFiles.map(file => {
          return buildImageItem(
            file.name,
            file.path,
            file.size || 0,
            file.sha,
            parsedWithBranch
          );
        });
      }

      setImages(imageList);
      setApiStatus(prev => ({ 
        ...prev, 
        loading: false, 
        error: imageList.length === 0 ? t.invalidFolderMessage : null 
      }));

    } catch (err: any) {
      console.error('Fetch repo contents error', err);
      let errMsg = err.message || t.fetchConnError;
      
      if (typeof errMsg === 'string' && (errMsg === 'Failed to fetch' || errMsg.toLowerCase().includes('failed to fetch') || errMsg.toLowerCase().includes('networkerror'))) {
        errMsg = lang === 'zh' 
          ? '网络请求失败 (Failed to fetch)。这通常是由于未配置 GitHub 访问 Token（匿名共享 IP 每小时 60 次上限极易被占用或耗尽），或者是本机的网络/代理未开启。建议在下方『展开高级选项』中：1) 配置您的 GitHub 个人 Token (无需勾选权限即可申请)；2) 确认您的网络可以连接 api.github.com。'
          : 'Failed to fetch. This typically occurs because the GitHub API rate limit for anonymous requests (60/hr per shared IP) has been exhausted, or the connection is blocked by a local proxy, VPN, or DNS restriction. To solve this, please click "Advanced Settings" below to: 1) Configure a personal GitHub Token (increases rate limit to 5,000/hr); 2) Verify your proxy allows requests to api.github.com.';
      }

      setApiStatus(prev => ({
        ...prev,
        loading: false,
        error: errMsg
      }));
    }
  };

  const updateRateLimits = (response: Response) => {
    const limit = response.headers.get('x-ratelimit-limit');
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (limit && remaining) {
      setApiStatus(prev => ({
        ...prev,
        rateLimitLimit: parseInt(limit, 10),
        rateLimitRemaining: parseInt(remaining, 10)
      }));
    }
  };

  const checkRateLimit = async (currentToken: string) => {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json'
    };
    if (currentToken.trim()) {
      headers['Authorization'] = `token ${currentToken.trim()}`;
    }

    try {
      const res = await fetch('https://api.github.com/rate_limit', { headers });
      if (res.ok) {
        const data = await res.json();
        const limit = data.resources?.core?.limit;
        const remaining = data.resources?.core?.remaining;
        
        if (typeof limit === 'number' && typeof remaining === 'number') {
          setApiStatus(prev => ({
            ...prev,
            rateLimitLimit: limit,
            rateLimitRemaining: remaining
          }));
        } else {
          updateRateLimits(res);
        }
      } else {
        updateRateLimits(res);
      }
    } catch (e) {
      console.error('Failed to check rate limit', e);
    }
  };

  useEffect(() => {
    // Keep rate limit updated on load and when token changes (with debounce)
    const timer = setTimeout(() => {
      checkRateLimit(token);
    }, 500);

    const interval = setInterval(() => {
      checkRateLimit(token);
    }, 30000); // Check every 30 seconds to keep stats fully accurate

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [token]);

  const buildImageItem = (
    name: string,
    path: string,
    size: number,
    sha: string,
    repo: GitHubRepoInfo
  ): ImageItem => {
    const cdnUrls: Record<string, string> = {};
    dynamicCdns.forEach(node => {
      cdnUrls[node.id] = buildCdnUrl(node.prefix, repo.owner, repo.repo, repo.branch, path);
    });

    return {
      name,
      path,
      size,
      sha,
      cdnUrls,
      downloadUrl: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.branch}/${path}`
    };
  };

  const totalSize = images.reduce((sum, img) => sum + img.size, 0);
  const formattedTotalSize = totalSize > 0 
    ? (totalSize / (1024 * 1024)).toFixed(2) + ' MB'
    : '0 MB';

  return (
    <div className="min-h-screen bg-[#EEF0F3] dark:bg-[#090D16] flex flex-col text-slate-800 dark:text-slate-100 antialiased font-sans transition-colors duration-300">
      <Header 
        lang={lang} 
        onLanguageChange={handleLanguageChange} 
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Responsive Dual Column layout (左右排版) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT SIDE PANEL - CONFIGURATION (Col span 5) */}
          <aside className="lg:col-span-5 space-y-6">
            <GitHubConfigCard 
              onFetch={executeFetch} 
              loading={apiStatus.loading}
              onClear={handleClearResults}
              hasResults={images.length > 0}
              token={token}
              onTokenChange={handleTokenChange}
              lang={lang}
              recursive={recursive}
              onRecursiveChange={setRecursive}
              onOpenUpload={() => setIsUploadOpen(true)}
            />

            {/* Accent CDN Core Selector - placed centrally inside work flow */}
            <div className="bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800/85 rounded-3xl p-6 shadow-md shadow-slate-200/40 dark:shadow-none hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300" id="cdn-selector-wrapper">
              <CDNSelector 
                selectedNode={selectedCdn} 
                onSelect={setSelectedCdn} 
                lang={lang} 
                dynamicCdns={dynamicCdns}
                onAddCustomCdn={handleAddCustomCdn}
                onRemoveCustomCdn={handleRemoveCustomCdn}
                onEditCustomCdn={handleEditCustomCdn}
              />
            </div>

            {/* Localized Project Stats - Super compact icon-powered horizontal bar */}
            <div className="bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800/85 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 shadow-md shadow-slate-200/40 dark:shadow-none hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300" id="project-stats-card">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100" title={t.statsFiles}>
                <ImageIcon className="h-5 w-5 text-slate-900 dark:text-slate-350" />
                <span>{images.length} <span className="text-slate-450 dark:text-slate-400 font-normal">{lang === 'zh' ? '张图片' : 'Assets'}</span></span>
              </div>
              <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100" title={t.statsSize}>
                <FolderDown className="h-5 w-5 text-slate-900 dark:text-slate-350" />
                <span>{formattedTotalSize}</span>
              </div>
              <div className={`flex items-center gap-1.5 font-bold ${images.length > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-500'}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${images.length > 0 ? 'bg-emerald-400' : 'bg-slate-300'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${images.length > 0 ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                </span>
                <span className="text-[13px] font-bold">
                  {apiStatus.loading 
                    ? t.syncing 
                    : images.length > 0 
                      ? t.synced 
                      : t.syncIdle
                  }
                </span>
              </div>
            </div>

            {/* API rate limit indicator card */}
            {apiStatus.rateLimitRemaining !== null && (
              <div className="bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800/85 rounded-2xl p-4 flex flex-col gap-2 shadow-md shadow-slate-200/30 dark:shadow-none hover:shadow-lg transition-all duration-350 animate-fade-in" id="api-rate-limit-card">
                <div className="flex items-center justify-between gap-4 w-full">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-slate-400 dark:text-slate-555 font-normal tracking-tight">{t.quotaLabel}</span>
                  </div>
                  <span className="font-extrabold text-slate-705 dark:text-slate-350 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">
                    {apiStatus.rateLimitRemaining} / {apiStatus.rateLimitLimit}
                  </span>
                </div>
                
                {apiStatus.rateLimitRemaining < 15 && (
                  <div className="text-[10px] bg-amber-50 dark:bg-amber-955/20 text-amber-705 dark:text-amber-400 p-2.5 rounded-lg font-bold flex items-start gap-1.5 border border-amber-100/50 dark:border-amber-900/30 w-full leading-normal">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="break-all">{t.quotaWarning}</span>
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* RIGHT SIDE PANEL - RESULTS (Col span 7) */}
          <section className="lg:col-span-7 space-y-6">

            {/* Request Error Feedback box with specialized rate limits unblock */}
            {apiStatus.error && (apiStatus.error === 'RATELIMIT_ERROR' || apiStatus.error.toLowerCase().includes('rate limit') || apiStatus.error.toLowerCase().includes('limit exceeded')) ? (
              <div className="bg-amber-50/70 rounded-3xl border border-amber-150 p-6 space-y-4 animate-fade-in" id="error-feedback-container">
                <div className="flex gap-3.5">
                  <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">{t.quotaRateTitle}</h3>
                    <p className="text-xs text-amber-850 mt-1 leading-relaxed">
                      {t.quotaRateDesc}
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-amber-100/60 p-5 space-y-3.5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Key className="h-4 w-4 text-amber-500" />
                      {t.quotaRateCardLabel}
                    </span>
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-705 hover:text-slate-900 font-bold flex items-center gap-0.5 underline decoration-slate-200 decoration-2 underline-offset-4 cursor-pointer"
                    >
                      {t.quotaRateGetToken}
                    </a>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => handleTokenChange(e.target.value)}
                      placeholder={t.quotaRatePlaceholder}
                      className="flex-1 rounded-xl border border-slate-205 py-2.5 px-3.5 text-xs font-mono focus:outline-hidden focus:border-slate-400 focus:ring-4 focus:ring-slate-100 bg-slate-50/20"
                    />
                    <button
                      type="button"
                      onClick={() => activeRepo && executeFetch(activeRepo, recursive, token)}
                      disabled={apiStatus.loading || !token.trim()}
                      className="rounded-xl px-5 py-2.5 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 transition-all cursor-pointer shadow-md shadow-slate-100"
                    >
                      {t.quotaRateBtn}
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-normal">
                    {t.quotaRateSafety}
                  </p>
                </div>
              </div>
            ) : apiStatus.error ? (
              <div className="bg-rose-50/40 rounded-3xl border border-rose-100 p-6 flex gap-3.5 animate-fade-in" id="error-feedback-container">
                <AlertCircle className="h-5.5 w-5.5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-rose-900">{t.errTitle}</h3>
                  <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                    {apiStatus.error}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Dynamic Image Representation Results panel */}
            {images.length > 0 ? (
              <ImageGrid
                images={images}
                selectedCdn={selectedCdn}
                selectedCdnName={selectedCdnName}
                lang={lang}
                onClear={handleClearResults}
                activeRepo={activeRepo}
                token={token}
                onTokenSave={handleTokenChange}
                onDeleteImage={(deletedSha) => {
                  setImages(prev => prev.filter(img => img.sha !== deletedSha));
                }}
              />
            ) : !apiStatus.loading && !apiStatus.error && (
              /* Empty state placeholder card */
              <div className="bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800/85 rounded-[1.75rem] shadow-md shadow-slate-200/40 dark:shadow-none hover:shadow-lg transition-all duration-300 p-10 text-center" id="empty-state-container">
                <div className="h-12 w-12 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-350 flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-750">
                  <ImageIcon className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{lang === 'zh' ? '等待提取转换' : 'Ready for CDN conversion'}</h3>
                
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                  {lang === 'zh' 
                    ? '请输入 GitHub 仓库文件夹路径开启极致多节点 CDN 路由，智能加速与缓存。' 
                    : 'Specify a GitHub relative image folder link above to trigger high-availability CDN acceleration.'}
                </p>

                <div className="mt-6 border-t border-slate-100/80 dark:border-slate-800 pt-5">
                  <div className="flex flex-wrap justify-center gap-1.5 max-w-sm mx-auto">
                    {['PNG', 'JPG', 'WEBP', 'GIF', 'SVG', 'ICO'].map((ext) => (
                      <span key={ext} className="bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100/50 dark:border-slate-800 text-slate-400 dark:text-slate-400 px-2 py-0.5 rounded-md text-[9.5px] font-mono tracking-wide transition-colors">
                        .{ext.toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </section>
        </div>

      </main>

      {/* Footer layout */}
      <footer className="border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#090D16] py-6 mt-12 text-center text-xs text-slate-450 dark:text-slate-500 font-sans transition-colors duration-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-1.5 leading-normal">
          <p>{t.footerText}</p>
        </div>
      </footer>

      {/* Upload Image Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setPastedFile(null);
        }}
        lang={lang}
        selectedCdn={selectedCdn}
        dynamicCdns={dynamicCdns}
        onSelectCdn={setSelectedCdn}
        initialRepoInfo={activeRepo}
        initialToken={token}
        onTokenSave={handleTokenChange}
        onImageUploaded={handleImageUploaded}
        initialFile={pastedFile}
        onClearInitialFile={() => setPastedFile(null)}
      />
    </div>
  );
}
