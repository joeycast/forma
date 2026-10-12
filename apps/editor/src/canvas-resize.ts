import { constrainShapeSize, type ShapeSize } from '../../../packages/core/src';
import type { ElementStyle } from '../../../packages/core/src/styles';

export const CANVAS_RESIZE_MINIMUM: ShapeSize = { width: 80, height: 40 };

/** Keep interactive resizing aligned with the document's width/height schema limits. */
export function constrainCanvasResize(size: ShapeSize, style?: ElementStyle): ShapeSize {
  return constrainShapeSize(size, style?.aspectRatio, CANVAS_RESIZE_MINIMUM);
}
