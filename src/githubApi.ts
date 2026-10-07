/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

/**
 * Fetch all unique directory paths from a GitHub repository
 */
export async function fetchRepoDirectories(
  owner: string,
  repo: string,
  branch = 'main',
  token = ''
): Promise<string[]> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
  };
  if (token.trim()) {
    headers['Authorization'] = `token ${token.trim()}`;
  }

  try {
    let targetBranch = branch || 'main';
    let res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`, {
      headers,
    });
    if (res.status === 404 && targetBranch === 'main') {
      const altRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`, { headers });
      if (altRes.ok) {
        res = altRes;
        targetBranch = 'master';
      }
    }
    if (!res.ok) {
      // Fallback: try contents endpoint at root
      const fallbackRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents?ref=${targetBranch}`, {
        headers,
      });
      if (!fallbackRes.ok) return [];
      const items = await fallbackRes.json();
      if (!Array.isArray(items)) return [];
      return items.filter((i: any) => i.type === 'dir').map((i: any) => i.path);
    }

    const data = await res.json();
    if (!data.tree || !Array.isArray(data.tree)) return [];

    const dirSet = new Set<string>();
    for (const item of data.tree) {
      if (item.type === 'tree' && typeof item.path === 'string') {
        dirSet.add(item.path);
      }
    }

    const dirs = Array.from(dirSet);
    dirs.sort((a, b) => a.localeCompare(b));
    return dirs;
  } catch (e) {
    console.error('Failed to fetch directories:', e);
    return [];
  }
}

export interface UploadResult {
  path: string;
  sha: string;
  size: number;
  downloadUrl: string;
  htmlUrl?: string;
}

/**
 * Upload an image file to GitHub via Contents API
 */
export async function uploadImageToGitHub({
  owner,
  repo,
  branch = 'main',
  folderPath = '',
  fileName,
  file,
  token,
  commitMessage,
}: {
  owner: string;
  repo: string;
  branch?: string;
  folderPath?: string;
  fileName: string;
  file: File;
  token: string;
  commitMessage?: string;
}): Promise<UploadResult> {
  if (!token.trim()) {
    throw new Error('MISSING_TOKEN');
  }

  // Clean path
  const cleanFolder = folderPath.trim().replace(/^\/+|\/+$/g, '');
  const cleanFileName = fileName.trim().replace(/^\/+/, '');
  const fullPath = cleanFolder ? `${cleanFolder}/${cleanFileName}` : cleanFileName;

  const base64Content = await fileToBase64(file);

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${fullPath}`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'Authorization': `token ${token.trim()}`,
  };

  const message = commitMessage || `Upload ${cleanFileName} via PicDeliver`;

  const payload: any = {
    message,
    content: base64Content,
    branch: branch || 'main',
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorDetail: any = {};
    try {
      errorDetail = await res.json();
    } catch {
      // ignore
    }

    if (res.status === 401) {
      throw new Error('TOKEN_INVALID');
    }
    if (res.status === 403) {
      throw new Error('TOKEN_NO_PERMISSION');
    }
    if (res.status === 404) {
      throw new Error('REPO_OR_BRANCH_NOT_FOUND');
    }
    if (res.status === 422 || res.status === 409) {
      throw new Error('FILE_ALREADY_EXISTS');
    }

    throw new Error(errorDetail.message || `Upload failed with status ${res.status}`);
  }

  const data = await res.json();
  return {
    path: data.content?.path || fullPath,
    sha: data.content?.sha || '',
    size: data.content?.size || file.size,
    downloadUrl: data.content?.download_url || `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fullPath}`,
    htmlUrl: data.content?.html_url || `https://github.com/${owner}/${repo}/blob/${branch}/${fullPath}`,
  };
}

/**
 * Delete an image file from GitHub via Contents API
 */
export async function deleteImageFromGitHub({
  owner,
  repo,
  branch = 'main',
  filePath,
  sha,
  token,
  commitMessage,
}: {
  owner: string;
  repo: string;
  branch?: string;
  filePath: string;
  sha: string;
  token: string;
  commitMessage?: string;
}): Promise<boolean> {
  if (!token.trim()) {
    throw new Error('MISSING_TOKEN');
  }

  const cleanPath = filePath.trim().replace(/^\/+/, '');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'Authorization': `token ${token.trim()}`,
  };

  const message = commitMessage || `🗑️ Delete ${cleanPath.split('/').pop()} via PicDeliver`;

  const payload: any = {
    message,
    sha,
    branch: branch || 'main',
  };

  const res = await fetch(url, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorDetail: any = {};
    try {
      errorDetail = await res.json();
    } catch {
      // ignore
    }

    if (res.status === 401) {
      throw new Error('TOKEN_INVALID');
    }
    if (res.status === 403) {
      throw new Error('TOKEN_NO_PERMISSION');
    }
    if (res.status === 404) {
      throw new Error('REPO_OR_FILE_NOT_FOUND');
    }
    if (res.status === 409) {
      throw new Error('SHA_MISMATCH');
    }

    throw new Error(errorDetail.message || `Delete failed with status ${res.status}`);
  }

  return true;
}
