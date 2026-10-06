/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitHubRepoInfo, ImageItem, CDNType, CDNNode } from './types';

export const CDN_NODES: CDNNode[] = [
  {
    id: 'jsdmirror1',
    name: 'JsdMirror1',
    description: '由 JsdMirror 提供的公益加速镜像，大陆节点极速访问',
    prefix: 'https://cdn.jsdmirror.com/gh',
    speedTag: '大陆可用',
    latencyIndicator: 'fast',
  },
  {
    id: 'gcore',
    name: 'Gcore 专属',
    description: '由 Gcore 全球网络加速，亚太极佳',
    prefix: 'https://gcore.jsdelivr.net/gh',
    speedTag: '国内推荐',
    latencyIndicator: 'fast',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare 专属',
    description: '基于 Cloudflare 企业极速骨干网络优化镜像',
    prefix: 'https://testingcf.jsdelivr.net/gh',
    speedTag: '多线优化',
    latencyIndicator: 'fast',
  },
  {
    id: 'jsdmirror2',
    name: 'JsdMirror2',
    description: 'JsdMirror 国内专属优化镜像，传输稳定高效',
    prefix: 'https://cdn.jsdmirror.cn/gh',
    speedTag: '国内友好',
    latencyIndicator: 'fast',
  },
  {
    id: 'jsdelivr',
    name: 'jsDelivr 原版',
    description: '官方正式主线路，国际纯正 CDN，稳定度高',
    prefix: 'https://cdn.jsdelivr.net/gh',
    speedTag: '全球友好',
    latencyIndicator: 'medium',
  },
  {
    id: 'fastly',
    name: 'Fastly 加速',
    description: '通过 Fastly 全球边缘节点进行高可用分发',
    prefix: 'https://fastly.jsdelivr.net/gh',
    speedTag: '全球加速',
    latencyIndicator: 'premium',
  }
];

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff', '.heic'];

export function isImageFile(filename: string): boolean {
  const lowerFile = filename.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lowerFile.endsWith(ext));
}

export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
  if (!url) return null;
  let cleanUrl = url.trim();

  // Strip protocol if present
  if (cleanUrl.startsWith('http://')) cleanUrl = cleanUrl.substring(7);
  if (cleanUrl.startsWith('https://')) cleanUrl = cleanUrl.substring(8);
  if (cleanUrl.startsWith('www.')) cleanUrl = cleanUrl.substring(4);

  // Strip github.com prefix
  if (cleanUrl.startsWith('github.com/')) {
    cleanUrl = cleanUrl.substring('github.com/'.length);
  }

  // Remove trailing slashes
  cleanUrl = cleanUrl.replace(/\/+$/, '');

  const segments = cleanUrl.split('/');
  if (segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1];

  let branch = '';
  let path = '';

  // E.g. owner/repo/tree/branch/path... OR owner/repo/blob/branch/path...
  if (segments.length >= 4 && (segments[2] === 'tree' || segments[2] === 'blob')) {
    branch = segments[3];
    path = segments.slice(4).join('/');
  }

  return { owner, repo, branch, path };
}

export function buildCdnUrl(nodePrefix: string, owner: string, repo: string, branch: string, filePath: string): string {
  // Ensure we don't have double slashes
  const cleanPath = filePath.replace(/^\/+/, '');
  return `${nodePrefix}/${owner}/${repo}@${branch}/${cleanPath}`;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
