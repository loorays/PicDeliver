/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitHubRepoInfo, CDNNode } from './types';

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

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp', '.ico', '.tiff', '.heic'];

export function getFileExtension(filename: string): string {
  const cleanName = filename.trim().split('?')[0].split('#')[0];
  const lastSlash = Math.max(cleanName.lastIndexOf('/'), cleanName.lastIndexOf('\\'));
  const baseName = lastSlash >= 0 ? cleanName.substring(lastSlash + 1) : cleanName;
  const dotIdx = baseName.lastIndexOf('.');
  if (dotIdx <= 0) return '';
  return baseName.substring(dotIdx).toLowerCase();
}

export function isImageFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ext !== '' && IMAGE_EXTENSIONS.includes(ext);
}

export interface AllowedFileCategory {
  key: string;
  labelZh: string;
  labelEn: string;
  exts: string[];
}

export const ALLOWED_FILE_CATEGORIES: AllowedFileCategory[] = [
  {
    key: 'scripts',
    labelZh: '脚本代码',
    labelEn: 'Scripts',
    exts: ['.js', '.mjs', '.cjs'],
  },
  {
    key: 'styles',
    labelZh: '样式表',
    labelEn: 'Styles',
    exts: ['.css', '.scss', '.less'],
  },
  {
    key: 'webdata',
    labelZh: 'JSON / 网页',
    labelEn: 'JSON & Web',
    exts: ['.json', '.map', '.html', '.htm'],
  },
  {
    key: 'fonts',
    labelZh: '字体',
    labelEn: 'Fonts',
    exts: ['.woff', '.woff2', '.ttf', '.otf', '.eot'],
  },
  {
    key: 'audio',
    labelZh: '音频',
    labelEn: 'Audio',
    exts: ['.mp3', '.wav', '.ogg', '.m4a', '.flac'],
  },
  {
    key: 'video',
    labelZh: '视频',
    labelEn: 'Video',
    exts: ['.mp4', '.webm', '.ogv'],
  },
  {
    key: 'docs',
    labelZh: '文档 / 文本 / 配置',
    labelEn: 'Docs & Config',
    exts: ['.pdf', '.txt', '.md', '.xml', '.yaml', '.yml', '.csv', '.tsv', '.toml'],
  },
  {
    key: 'binary',
    labelZh: 'WASM / 压缩包',
    labelEn: 'WASM & Archive',
    exts: ['.wasm', '.zip', '.gz', '.br'],
  },
];

export const ALLOWED_FILE_EXTENSIONS: string[] = ALLOWED_FILE_CATEGORIES.flatMap(c => c.exts);

export const TEXT_VIEWABLE_EXTENSIONS = new Set<string>([
  '.js', '.mjs', '.cjs',
  '.css', '.scss', '.less',
  '.json', '.map',
  '.html', '.htm',
  '.txt', '.md', '.xml', '.yaml', '.yml',
  '.csv', '.tsv', '.toml',
]);

export function isAllowedUploadFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ext !== '' && ALLOWED_FILE_EXTENSIONS.includes(ext);
}

export function isTextViewableFile(filename: string): boolean {
  return TEXT_VIEWABLE_EXTENSIONS.has(getFileExtension(filename));
}

export function isAudioFile(filename: string): boolean {
  return ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(getFileExtension(filename));
}

export function isVideoFile(filename: string): boolean {
  return ['.mp4', '.webm', '.ogv'].includes(getFileExtension(filename));
}

function safeDecodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
  if (!url) return null;
  let cleanUrl = url.trim().split('?')[0].split('#')[0];

  // Strip protocol if present
  if (cleanUrl.startsWith('http://')) cleanUrl = cleanUrl.substring(7);
  if (cleanUrl.startsWith('https://')) cleanUrl = cleanUrl.substring(8);
  if (cleanUrl.startsWith('www.')) cleanUrl = cleanUrl.substring(4);

  // Strip github.com prefix
  if (cleanUrl.startsWith('github.com/')) {
    cleanUrl = cleanUrl.substring('github.com/'.length);
  }

  // Remove trailing slashes and .git suffix
  cleanUrl = cleanUrl.replace(/\/+$/, '');

  const segments = cleanUrl.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const owner = safeDecodeSegment(segments[0]);
  const repo = safeDecodeSegment(segments[1]).replace(/\.git$/i, '');
  if (!owner || !repo) return null;

  let branch = '';
  let path = '';

  // E.g. owner/repo/tree/branch/path... OR owner/repo/blob/branch/path...
  if (segments.length >= 4 && (segments[2] === 'tree' || segments[2] === 'blob')) {
    branch = safeDecodeSegment(segments[3]);
    path = segments.slice(4).map(safeDecodeSegment).join('/');
  }

  return { owner, repo, branch, path };
}

export function buildCdnUrl(nodePrefix: string, owner: string, repo: string, branch: string, filePath: string): string {
  const cleanPrefix = nodePrefix.trim().replace(/\/+$/, '');
  const cleanPath = filePath.replace(/^\/+/, '');
  const encodedPath = cleanPath
    .split('/')
    .filter(Boolean)
    .map(seg => encodeURIComponent(safeDecodeSegment(seg)))
    .join('/');
  return `${cleanPrefix}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}@${branch || 'main'}/${encodedPath}`;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
