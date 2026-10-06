/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React from 'react';
import { Github, Globe, Sun, Moon, Upload } from 'lucide-react';
import { Language } from '../translations';

interface HeaderProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  onOpenUpload?: () => void;
}

export default function Header({ lang, onLanguageChange, onOpenUpload }: HeaderProps) {
  return (
    <header className="border-b border-slate-100 dark:border-slate-800/80 bg-white/95 dark:bg-[#090D16]/95 backdrop-blur-md sticky top-0 z-50 py-3.5 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
        {/* Left Side Branding */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <span className="h-5 w-1 bg-slate-800 dark:bg-emerald-500 rounded-full mr-2" />
            <h1 className="font-sans text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              Pic<span className="text-slate-800 dark:text-slate-300">Deliver</span>
            </h1>
          </div>
          <span className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden md:block" />
          <p className="text-[11px] text-slate-450 dark:text-slate-400 font-medium hidden md:block">
            {lang === 'zh'
              ? '一键转换 GitHub 仓库中的图片为高速、稳定的多节点 CDN 静态图床外链'
              : 'Convert the images of GitHub repositories into high-availability global CDN static links'}
          </p>
        </div>

        {/* Right Side: Language Switcher and Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {onOpenUpload && (
            <button
              type="button"
              id="header-upload-btn"
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{lang === 'zh' ? '上传图片' : 'Upload Image'}</span>
            </button>
          )}

          <a
            href="https://github.com/Rqtzbot/PicDeliver"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 transition-colors"
            title="GitHub"
          >
            <Github className="h-4.5 w-4.5" />
          </a>

          {/* Custom micro pill language toggler */}
          <div className="flex items-center bg-slate-150/40 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-700">
            <button
              onClick={() => onLanguageChange('zh')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                lang === 'zh'
                  ? 'bg-[#e8e8e8] dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs'
                  : 'text-slate-450 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-205'
              }`}
            >
              中文
            </button>
            <button
              onClick={() => onLanguageChange('en')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                lang === 'en'
                  ? 'bg-[#eeeeee] dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs'
                  : 'text-slate-450 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-205'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
