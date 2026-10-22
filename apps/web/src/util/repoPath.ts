/**
 * Read what a user pasted into the import dialog's filter field: a full
 * repository URL or an `owner/repo`-shaped path means "import this directly";
 * anything else is a plain filter word. Two or three `[\w.-]+` segments —
 * GitHub/Gitee's `owner/repo`, GitLab's `group/sub/project`; the server
 * validates the path against the host anyway, so being generous here only
 * decides whether the direct-import affordance appears.
 */
export function repoPathFromInput(text: string): string | null {
  const s = text.trim().replace(/^https?:\/\/[^/]+\//i, '').replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  if (!s) return null;
  const segs = s.split('/');
  if (segs.length < 2 || segs.length > 3 || segs.some((seg) => !/^[\w.-]+$/.test(seg))) return null;
  return s;
}
