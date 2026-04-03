import { useEffect } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';

/**
 * Global keyboard shortcuts for the wall builder.
 * Skipped when focus is inside an input/select/textarea.
 */
export function useKeyboardShortcuts() {
  const copySelectedTiles       = useProjectStore((s) => s.copySelectedTiles);
  const pasteTiles              = useProjectStore((s) => s.pasteTiles);
  const deleteSelectedTiles     = useProjectStore((s) => s.deleteSelectedTiles);
  const moveSelectedTiles       = useProjectStore((s) => s.moveSelectedTiles);
  const rotateSelectedTiles     = useProjectStore((s) => s.rotateSelectedTiles);
  const navigateRoutingCursor   = useProjectStore((s) => s.navigateRoutingCursor);
  const selectAllWallTiles      = useProjectStore((s) => s.selectAllWallTiles);
  const clearSelection          = useProjectStore((s) => s.clearSelection);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in a form element
      const tag = (e.target as HTMLElement)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'c') { e.preventDefault(); copySelectedTiles(); return; }
      if (ctrl && e.key === 'v') { e.preventDefault(); pasteTiles(); return; }

      if (ctrl && e.key === 'a') {
        e.preventDefault();
        const { appMode } = useProjectStore.getState();
        if (appMode === 'select') selectAllWallTiles();
        return;
      }
      if (ctrl && e.key === 'd') {
        e.preventDefault();
        clearSelection();
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        const { appMode, selectedTileIds } = useProjectStore.getState();
        if (appMode === 'select' && selectedTileIds.length > 0) {
          e.preventDefault();
          if (!useLicenseStore.getState().isPro) return; // rotation is pro-only
          rotateSelectedTiles(e.shiftKey ? -90 : 90);
          return;
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
        e.preventDefault();
        deleteSelectedTiles();
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const { appMode, activePortId, activeCircuitId, selectedTileIds } = useProjectStore.getState();
        const inRoutingMode =
          (appMode === 'port-routing'    && !!activePortId) ||
          (appMode === 'circuit-routing' && !!activeCircuitId);

        if (inRoutingMode && selectedTileIds.length > 0) {
          // Arrow keys navigate and assign tiles along the chain
          navigateRoutingCursor(e.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown');
        } else if (!inRoutingMode) {
          // Arrow keys nudge selected tiles (normal select mode)
          const step = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowLeft')  moveSelectedTiles(-step, 0);
          if (e.key === 'ArrowRight') moveSelectedTiles(step, 0);
          if (e.key === 'ArrowUp')    moveSelectedTiles(0, -step);
          if (e.key === 'ArrowDown')  moveSelectedTiles(0, step);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copySelectedTiles, pasteTiles, deleteSelectedTiles, moveSelectedTiles, rotateSelectedTiles, navigateRoutingCursor, selectAllWallTiles, clearSelection]);
}
