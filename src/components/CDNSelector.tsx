/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Globe, 
  Orbit, 
  Cloud, 
  Compass, 
  Layers, 
  Zap, 
  Sparkles, 
  Plus, 
  X, 
  Pencil 
} from 'lucide-react';
import { CDNType, CDNNode } from '../types';

interface CDNSelectorProps {
  selectedNode: CDNType;
  onSelect: (nodeType: CDNType) => void;
  lang: string;
  dynamicCdns: CDNNode[];
  onAddCustomCdn: (name: string, prefix: string) => void;
  onRemoveCustomCdn: (id: string) => void;
  onEditCustomCdn: (id: string, name: string, prefix: string) => void;
}

export default function CDNSelector({
  selectedNode,
  onSelect,
  lang,
  dynamicCdns,
  onAddCustomCdn,
  onRemoveCustomCdn,
  onEditCustomCdn,
}: CDNSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<CDNNode | null>(null);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(lang === 'zh' ? '请输入节点名称' : 'Please enter node name');
      return;
    }
    if (!prefix.trim()) {
      setError(lang === 'zh' ? '请输入 CDN 前缀链接' : 'Please enter CDN prefix link');
      return;
    }
    if (!prefix.trim().startsWith('http://') && !prefix.trim().startsWith('https://')) {
      setError(lang === 'zh' ? '前缀链接必须以 http:// 或 https:// 开头' : 'Prefix must start with http:// or https://');
      return;
    }

    if (editingNode) {
      onEditCustomCdn(editingNode.id, name, prefix);
    } else {
      onAddCustomCdn(name, prefix);
    }
    setName('');
    setPrefix('');
    setEditingNode(null);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-3.5 w-full" id="cdn-selector-container">
      {/* 1. Header Area: Label + Button */}
      <div className="flex items-center justify-between w-full" id="cdn-selector-header-row">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2 mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-200 tracking-tight">
            {lang === 'zh' ? 'CDN 加速节点' : 'CDN Delivery Nodes'}
          </h3>
          <span className="inline-flex items-center rounded-md bg-slate-55 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-extrabold text-slate-700 dark:text-slate-300 ring-1 ring-inset ring-slate-200/50 dark:ring-slate-700">
            {dynamicCdns.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-705 dark:text-slate-300 bg-slate-50 dark:bg-[#090D16] hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition-all rounded-lg select-none cursor-pointer border border-slate-200 dark:border-slate-800"
          id="add-custom-cdn-btn"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{lang === 'zh' ? '添加 CDN' : 'Add CDN'}</span>
        </button>
      </div>

      {/* 2. Grid list of CDN choices */}
      <div className="grid grid-cols-2 gap-2.5 w-full" id="cdn-selector-row">
        {dynamicCdns.map((node, index) => {
          const isSelected = selectedNode === node.id;
          const isCustom = node.id.startsWith('custom-');

          let Icon = Sparkles;
          if (node.id === 'jsdmirror1') Icon = Globe;
          else if (node.id === 'gcore') Icon = Orbit;
          else if (node.id === 'cloudflare') Icon = Cloud;
          else if (node.id === 'jsdmirror2') Icon = Compass;
          else if (node.id === 'jsdelivr') Icon = Layers;
          else if (node.id === 'fastly') Icon = Zap;

          const displayLabel = node.name.replace(' 专属', '').replace(' 加速', '').replace(' 原版', '');
          const speedLabel = node.speedTag || (lang === 'zh' ? '自建线路' : 'Custom');

          return (
            <div
              key={node.id}
              title={node.description}
              style={{ borderRadius: index === 0 ? '17px' : '16px' }}
              className={`relative border transition-all duration-300 select-none cursor-pointer flex flex-col justify-between h-[72px]
                ${index === 0 ? 'rounded-[17px]' : 'rounded-[16px]'}
                ${isSelected
                  ? 'bg-slate-900 border-slate-900 dark:bg-emerald-500 dark:border-emerald-500 text-white dark:text-slate-950 dark:shadow-md -translate-y-0.5 font-bold'
                  : 'bg-slate-50 dark:bg-[#090D16] border-slate-200/50 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-900/40 hover:-translate-y-0.5 text-slate-800 dark:text-slate-300'
                }`}
              onClick={() => onSelect(node.id)}
            >
              {/* Card top */}
              <div className="flex items-center justify-between w-full min-w-0 p-2.5 pb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-7 w-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-white/15 text-white dark:text-slate-950 font-bold' : 'bg-white dark:bg-[#151E33] text-slate-500 dark:text-slate-400 shadow-2xs'}`}>
                    <Icon className="h-3.5 w-3.5 stroke-[2.2]" />
                  </span>
                  <span
                    style={{ fontFamily: 'Inter' }}
                    className={`text-[15px] font-extrabold truncate ${isSelected ? 'text-white dark:text-slate-950' : 'text-slate-800 dark:text-slate-200'}`}
                  >
                    {displayLabel.charAt(0).toUpperCase() + displayLabel.slice(1)}
                  </span>
                </div>

                {isCustom && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNode(node);
                        setName(node.name);
                        setPrefix(node.prefix);
                        setIsModalOpen(true);
                      }}
                      className={`flex items-center justify-center rounded-lg p-0.5 transition-colors cursor-pointer h-[22px] w-[22px] ${
                        isSelected
                          ? 'text-white/55 hover:text-white hover:bg-white/10'
                          : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20'
                      }`}
                      title={lang === 'zh' ? '编辑自定义节点' : 'Edit custom node'}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveCustomCdn(node.id);
                      }}
                      className={`flex items-center justify-center rounded-lg p-0.5 transition-colors cursor-pointer h-[22px] w-[22px] ${
                        isSelected
                          ? 'text-white/55 hover:text-rose-450 hover:bg-white/10'
                          : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                      }`}
                      title={lang === 'zh' ? '删除自定义节点' : 'Delete custom node'}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Card bottom speed marker */}
              <div className="flex items-center justify-between mt-1 min-w-0 p-2.5 pt-0">
                <span className={`text-[9px] font-bold truncate px-1.5 py-0.5 rounded-md ${isSelected ? 'text-white/95 bg-white/15 dark:text-slate-950 dark:bg-black/10' : 'text-slate-500 dark:text-slate-400 bg-slate-200/50 dark:bg-slate-800/60'}`}>
                  {speedLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white/95 dark:bg-[#151E33] dark:border dark:border-slate-850 backdrop-blur-md rounded-3xl max-w-md w-full p-6 shadow-[0_20px_50px_rgba(0,0,0,0.15)] space-y-4 relative text-slate-800 dark:text-slate-100 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {editingNode ? (
                  <Pencil className="h-4 w-4 text-emerald-500 dark:text-emerald-400 font-bold" />
                ) : (
                  <Plus className="h-4 w-4 text-slate-850 dark:text-emerald-400 font-bold" />
                )}
                {editingNode 
                  ? (lang === 'zh' ? '编辑自定义 CDN 链接' : 'Edit Custom CDN')
                  : (lang === 'zh' ? '添加自定义 CDN 链接' : 'Add Custom CDN')
                }
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingNode(null);
                  setError(null);
                  setName('');
                  setPrefix('');
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                  {lang === 'zh' ? 'CDN 节点名称' : 'CDN Node Name'}
                </label>
                <input
                  type="text"
                  placeholder={lang === 'zh' ? '例如：GitMirror' : 'e.g., GitMirror'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-800 py-2.5 px-3.5 text-xs focus:outline-hidden focus:border-slate-400 focus:ring-4 focus:ring-slate-100/60 bg-white dark:bg-[#090D16] text-slate-800 dark:text-slate-100 placeholder-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                  {lang === 'zh' ? 'CDN 前缀链接' : 'CDN Prefix URL'}
                </label>
                <input
                  type="text"
                  placeholder={lang === 'zh' ? '例如：https://jsd.cdn.eu.org/gh' : 'e.g., https://jsd.cdn.eu.org/gh'}
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-800 py-2.5 px-3.5 text-xs font-mono focus:outline-hidden focus:border-slate-400 focus:ring-4 focus:ring-slate-100/60 bg-white dark:bg-[#090D16] text-slate-800 dark:text-slate-100 placeholder-slate-400"
                />
                <span className="text-[10px] text-slate-400 mt-1.5 block leading-relaxed">
                  {lang === 'zh'
                    ? '⚠️ 必须兼容 jsDelivr 规则，系统将自动在其后拼接: /用户名/仓库@分支/路径'
                    : '⚠️ Must support jsDelivr route convention. Automatically appends: /{username}/{repo}@{branch}/{path}'
                  }
                </span>
              </div>

              {error && (
                <p className="text-xs text-rose-500 font-bold bg-rose-50/50 p-2.5 rounded-lg border border-rose-100">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingNode(null);
                    setError(null);
                    setName('');
                    setPrefix('');
                  }}
                  className="px-4 py-2 text-xs font-bold border border-slate-205 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-805 cursor-pointer text-slate-600 dark:text-slate-300"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-black dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 cursor-pointer text-white shadow-xs transition-colors"
                >
                  {editingNode 
                    ? (lang === 'zh' ? '保存修改' : 'Save Changes')
                    : (lang === 'zh' ? '添加节点' : 'Add Node')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
