import { useEffect, useRef } from 'react';
import { withBase } from '../basePath';

/**
 * Aldine plugin host.
 * Plugins are ES modules served from /plugins/<id>/<entry> exporting:
 *   export default { activate(aldine: AldineAPI): void }
 * The API is intentionally small and stable; panels render vanilla DOM.
 */

export interface PluginPanel {
  id: string;
  title: string;
  mount(el: HTMLElement): void;
  /** Fires on every activation of the tab (mount itself happens once). */
  onShow?(): void;
}

export interface PluginCtx {
  projectId: string;
  branch: string;
  getActiveFile(): string | null;
  getCompileResult(): { ok: boolean; errors: Array<{ type: string; line: number | null; message: string; file?: string }>; log: string } | null;
  insertAtCursor(text: string): void;
  refreshFiles(): Promise<unknown>;
  refreshProject(): Promise<unknown>;
  openFile(path: string): void;
  compile(): void;
  toast(text: string, kind?: 'info' | 'error' | 'ok'): void;
}

export interface AldineAPI {
  version: 1;
  project: {
    readonly id: string;
    readonly branch: string;
    activeFile(): string | null;
    lastCompile(): { ok: boolean; errors: Array<{ type: string; line: number | null; message: string; file?: string }>; log: string } | null;
    refreshFiles(): Promise<unknown>;
    refresh(): Promise<unknown>;
    /** Opens a file in the editor pane (a no-op for a path that is not in the tree). */
    openFile(path: string): void;
  };
  editor: { insertAtCursor(text: string): void };
  compile(): void;
  toast(text: string, kind?: 'info' | 'error' | 'ok'): void;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  ui: { registerSidebarPanel(panel: { id: string; title: string; render(el: HTMLElement): void; onShow?(): void }): void };
}

interface Props {
  ctx: PluginCtx;
  onPanels(panels: PluginPanel[]): void;
}

export function PluginHost({ ctx, onPanels }: Props) {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    let cancelled = false;
    const panels: PluginPanel[] = [];

    const api: AldineAPI = {
      version: 1,
      project: {
        get id() { return ctxRef.current.projectId; },
        get branch() { return ctxRef.current.branch; },
        activeFile: () => ctxRef.current.getActiveFile(),
        lastCompile: () => ctxRef.current.getCompileResult(),
        refreshFiles: () => ctxRef.current.refreshFiles(),
        refresh: () => ctxRef.current.refreshProject(),
        openFile: (path: string) => ctxRef.current.openFile(path),
      },
      editor: { insertAtCursor: (t) => ctxRef.current.insertAtCursor(t) },
      compile: () => ctxRef.current.compile(),
      toast: (t, k) => ctxRef.current.toast(t, k),
      // plugins address the API root-relatively; the base path is the host's concern
      fetch: (url, init) => fetch(url.startsWith('/') ? withBase(url) : url, init),
      ui: {
        registerSidebarPanel(panel) {
          panels.push({ id: `plugin:${panel.id}`, title: panel.title, mount: (el) => panel.render(el), onShow: panel.onShow });
        },
      },
    };

    (async () => {
      try {
        const res = await fetch(withBase('/api/plugins'));
        const manifests = (await res.json()) as Array<{ id: string; entry: string; enabled?: boolean }>;
        for (const m of manifests) {
          if (m.enabled === false) continue;
          try {
            const mod = await import(/* @vite-ignore */ withBase(`/plugins/${m.id}/${m.entry}`));
            mod.default?.activate?.(api);
          } catch (err) {
            console.error(`[plugins] failed to load ${m.id}`, err);
          }
        }
        if (!cancelled) onPanels([...panels]);
      } catch (err) {
        console.error('[plugins] registry unavailable', err);
      }
    })();

    return () => { cancelled = true; onPanels([]); };
    // re-activate per project/branch so panels rebuild against fresh context
  }, [ctx.projectId, ctx.branch]);

  return null;
}
