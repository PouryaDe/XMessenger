/**
 * Message Context Menu Positioning Engine
 * Calculates collision-free, optimal screen coordinates for floating message menus,
 * preventing any clipping on top, bottom, left, and right boundaries.
 */

export interface RectBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MenuPositionOptions {
  bubbleRect: RectBounds;
  menuWidth?: number;
  menuHeight?: number;
  containerRect?: RectBounds | null;
  viewportWidth: number;
  viewportHeight: number;
  isOwn: boolean;
  padding?: number;
  gap?: number;
}

export interface CalculatedMenuPosition {
  top: number;
  left: number;
  transformOrigin: string;
}

export function calculateMessageMenuPosition(options: MenuPositionOptions): CalculatedMenuPosition {
  const {
    bubbleRect,
    menuWidth = 196,
    menuHeight = 188,
    containerRect,
    viewportWidth,
    viewportHeight,
    isOwn,
    padding = 10,
    gap = 6
  } = options;

  // Viewport and container boundary constraints
  let minX = containerRect ? Math.max(padding, containerRect.left + padding) : padding;
  let maxX = containerRect ? Math.min(viewportWidth - padding, containerRect.right - padding) : (viewportWidth - padding);
  const minY = containerRect ? Math.max(padding, containerRect.top + padding) : padding;
  const maxY = containerRect ? Math.min(viewportHeight - padding, containerRect.bottom - padding) : (viewportHeight - padding);

  // If container width is narrower than menu (e.g. mobile viewports), fallback to full viewport width
  if (maxX - minX < menuWidth) {
    minX = padding;
    maxX = viewportWidth - padding;
  }

  // Vertical placement (collision detection & best clearance side selection)
  const spaceBelow = maxY - bubbleRect.bottom - gap;
  const spaceAbove = bubbleRect.top - minY - gap;

  let top: number;
  let vOrigin: 'top' | 'bottom';

  if (spaceBelow >= menuHeight) {
    top = bubbleRect.bottom + gap;
    vOrigin = 'top';
  } else if (spaceAbove >= menuHeight) {
    top = bubbleRect.top - menuHeight - gap;
    vOrigin = 'bottom';
  } else {
    if (spaceBelow >= spaceAbove) {
      top = Math.min(bubbleRect.bottom + gap, maxY - menuHeight);
      vOrigin = 'top';
    } else {
      top = Math.max(minY, bubbleRect.top - menuHeight - gap);
      vOrigin = 'bottom';
    }
  }
  top = Math.max(minY, Math.min(top, maxY - menuHeight));

  // Horizontal placement (anchored naturally to bubble alignment)
  const idealLeft = isOwn ? (bubbleRect.right - menuWidth) : bubbleRect.left;
  const left = Math.max(minX, Math.min(idealLeft, maxX - menuWidth));
  const hOrigin = isOwn ? 'right' : 'left';

  return {
    top: Math.round(top),
    left: Math.round(left),
    transformOrigin: `${vOrigin} ${hOrigin}`
  };
}

