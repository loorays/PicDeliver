/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { Search, Link, ShieldAlert, Key, FolderDown, HelpCircle, Check, Info, Upload } from 'lucide-react';
import { parseGitHubUrl } from '../utils';
import { GitHubRepoInfo } from '../types';
import { translations, Language } from '../translations';

interface GitHubConfigCardProps {
  onFetch: (repoInfo: GitHubRepoInfo, recursive: boolean, token: string) => void;
  loading: boolean;
  onClear: () => void;
  hasResults: boolean;
  token: string;
  onTokenChange: (newToken: string) => void;
  lang: Language;
  recursive: boolean;
  onRecursiveChange: (val: boolean) => void;
  onOpenUpload?: () => void;
}

export default function GitHubConfigCard({ 
  onFetch, 
  loading, 
  onClear, 
  hasResults, 
  token, 
  onTokenChange,
  lang,
  recursive,
  onRecursiveChange,
  onOpenUpload
}: GitHubConfigCardProps) {
  const t = translations[lang];
  const [urlInput, setUrlInput] = useState('');
  const [showAdvance, setShowAdvance] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<GitHubRepoInfo | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Parse on-the-fly
  useEffect(() => {
    if (!urlInput.trim()) {
      setParsedInfo(null);
      setValidationError(null);
      return;
    }
    const info = parseGitHubUrl(urlInput);
    if (info) {
      setParsedInfo(info);
      setValidationError(null);
    } else {
      setParsedInfo(null);
      setValidationError(t.validationError);
    }
  }, [urlInput, lang]);

  // Save token of GitHub
  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onTokenChange(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedInfo) {
      setValidationError(t.validationError);
      return;
    }
    onFetch(parsedInfo, recursive, token);
  };

  return (
    <div className="bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-md shadow-slate-200/40 dark:shadow-none hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* GitHub Folder Address input */}
        <div>
          <label htmlFor="github-url-input" className="block text-[15px] font-bold text-slate-705 dark:text-slate-250 mb-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {t.folderLabel}
          </label>
          <div className="relative rounded-xl shadow-xs">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
              <Search className="h-4.5 w-4.5 text-slate-400 dark:text-slate-500" />
            </div>
            <input
              type="text"
              id="github-url-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder=""
              className={`block w-full rounded-xl border py-3.5 pl-11 pr-4 text-xs transition-all focus:outline-hidden font-sans placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-100
                ${validationError 
                  ? 'border-rose-200 bg-rose-50/10 focus:border-rose-400 focus:ring-4 focus:ring-rose-50 dark:border-rose-950/50' 
                  : parsedInfo 
                    ? 'border-emerald-200 bg-emerald-50/5 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-[#090D16] focus:border-slate-400 dark:focus:border-slate-500 focus:ring-4 focus:ring-slate-100/60 dark:focus:ring-slate-800/30'
                }`}
            />
          </div>

          {/* Validation indicators */}
          {validationError && (
            <p className="mt-2 text-xs text-rose-500 font-medium flex items-center gap-1.5 animate-fade-in" id="github-url-validation-error">
              <ShieldAlert className="h-3.5 w-3.5 flex-none" />
              {validationError}
            </p>
          )}

          {parsedInfo && (
            <div className="mt-2.5 bg-slate-50 dark:bg-[#090D16]/90 rounded-xl p-3.5 text-[11px] text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800 flex flex-wrap gap-x-4 gap-y-1.5 animate-fade-in" id="github-url-parsed-info">
              <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-emerald-500 stroke-[3]" />
                {t.parsingSuccess}：
              </span>
              <span>
                <b className="text-slate-500 dark:text-slate-400 font-normal">{t.owner}:</b> <code className="font-mono bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800 text-slate-705 dark:text-slate-200 px-1 py-0.5 rounded">{parsedInfo.owner}</code>
              </span>
              <span>
                <b className="text-slate-500 dark:text-slate-400 font-normal">{t.repo}:</b> <code className="font-mono bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800 text-slate-705 dark:text-slate-200 px-1 py-0.5 rounded">{parsedInfo.repo}</code>
              </span>
              <span>
                <b className="text-slate-500 dark:text-slate-400 font-normal">{t.branch}:</b> <code className="font-mono bg-white dark:bg-[#151E33] border border-slate-100 dark:border-slate-800 text-slate-705 dark:text-slate-200 px-1 py-0.5 rounded">{parsedInfo.branch || 'main'}</code>
              </span>
              {parsedInfo.path && (
                <span>
                  <b className="text-slate-500 dark:text-slate-400 font-normal">{t.subpath}:</b> <code className="font-mono bg-slate-105 dark:bg-[#151E33] border border-slate-100 dark:border-slate-800 text-slate-702 dark:text-slate-200 px-1 py-0.5 rounded">{parsedInfo.path}</code>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Advanced trigger toggle */}
        <div>
          <button
            type="button"
            id="advanced-options-trigger"
            onClick={() => setShowAdvance(!showAdvance)}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-bold flex items-center gap-1.5 focus:outline-hidden cursor-pointer"
          >
            <FolderDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showAdvance ? 'rotate-180' : ''}`} />
            <span>{showAdvance ? t.hideAdvanced : t.seeAdvanced}</span>
          </button>

          {showAdvance && (
            <div className="mt-3 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-[#090D16] space-y-3.5 animate-fade-in" id="advanced-options-panel">
              {/* GitHub Token */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="github-token-input" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Key className="h-3.5 w-3.5 text-amber-500" />
                    {t.tokenLabel}
                  </label>
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold"
                  >
                    <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                  </a>
                </div>
                <input
                  type="password"
                  id="github-token-input"
                  value={token}
                  onChange={handleTokenChange}
                  placeholder={t.tokenPlaceholder}
                  className="block w-full rounded-lg border border-slate-200 dark:border-slate-800 py-1.5 px-3 text-xs font-mono transition-all focus:outline-hidden focus:border-slate-400 dark:focus:border-slate-500 focus:ring-2 focus:ring-slate-100 dark:focus:ring-slate-800 bg-white dark:bg-[#090D16] text-slate-800 dark:text-slate-100"
                />
                <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 leading-normal flex items-center gap-1">
                  <Info className="h-3.5 w-3.5 text-slate-450 dark:text-slate-500 flex-none" />
                  <span>
                    {lang === 'zh' ? '额度提升为 5000 次/小时，安全保存在本地' : 'Boosts rate limit to 5000/hr. Kept in LocalStorage.'}
                  </span>
                </p>
              </div>

              {/* Recursive Scan Toggle */}
              <div className="pt-3.5 border-t border-slate-200/40 dark:border-slate-800/60 flex items-center justify-between gap-4" id="recursive-scan-container">
                <div className="flex flex-col gap-0.5 max-w-[80%]">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 select-none">
                    <FolderDown className="h-3.5 w-3.5 text-emerald-500" />
                    {t.recursiveToggle}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                    {t.recursiveDesc}
                  </span>
                </div>
                <button
                  type="button"
                  id="recursive-scan-toggle"
                  onClick={() => onRecursiveChange(!recursive)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden
                    ${recursive ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-slate-200 dark:bg-slate-805'}`}
                  role="switch"
                  aria-checked={recursive}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-slate-950 shadow-xs ring-0 transition duration-200 ease-in-out
                      ${recursive ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Button Row */}
        <div className="flex gap-2.5">
          {hasResults && (
            <button
              type="button"
              onClick={onClear}
              className="px-3 rounded-xl text-xs font-bold bg-rose-50/55 dark:bg-rose-950/20 border border-slate-200/85 dark:border-rose-950/60 hover:bg-rose-100/60 dark:hover:bg-rose-900/10 text-rose-600 dark:text-rose-450 hover:text-rose-700 transition-all cursor-pointer py-3 shrink-0"
            >
              {lang === 'zh' ? '清除数据' : 'Clear'}
            </button>
          )}

          <button
            type="submit"
            id="btn-fetch-generate"
            disabled={loading || !parsedInfo}
            className={`flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-bold tracking-wider transition-all focus:outline-hidden cursor-pointer flex-1
              ${loading 
                ? 'bg-slate-400 text-white cursor-not-allowed' 
                : parsedInfo
                  ? 'bg-slate-900 hover:bg-black text-white dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:hover:text-black font-extrabold active:scale-[0.98] shadow-md dark:shadow-none'
                  : 'bg-slate-200 dark:bg-slate-800/80 cursor-not-allowed text-slate-400 dark:text-slate-500'
              }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{t.btnLoading}</span>
              </>
            ) : (
              <span>{t.btnStart}</span>
            )}
          </button>

          {onOpenUpload && (
            <button
              type="button"
              id="card-upload-btn"
              onClick={onOpenUpload}
              className="flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 border border-emerald-500/20 text-xs font-bold transition-all cursor-pointer shrink-0 active:scale-95"
              title={lang === 'zh' ? '上传图片并获取 CDN 链接' : 'Upload image & get CDN link'}
            >
              <Upload className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>{lang === 'zh' ? '上传图片' : 'Upload'}</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
