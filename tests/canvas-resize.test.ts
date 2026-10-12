import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_REGISTRY } from '../packages/core/src';
import { constrainCanvasResize } from '../apps/editor/src/canvas-resize';

test('canvas resize treats shape registry sizes as natural defaults, not hard minima', () => {
  assert.equal(SHAPE_REGISTRY.rect.minWidth, 180);
  assert.deepEqual(constrainCanvasResize({ width: 80, height: 40 }, { shape: 'rect' }), {
    width: 80,
    height: 40,
  });
});

test('canvas resize applies explicit aspect ratios within schema minimums', () => {
  assert.deepEqual(constrainCanvasResize({ width: 90, height: 40 }, { aspectRatio: 1 }), {
    width: 90,
    height: 90,
  });
  assert.deepEqual(constrainCanvasResize({ width: 70, height: 30 }, { aspectRatio: 1 }), {
    width: 80,
    height: 80,
  });
});
