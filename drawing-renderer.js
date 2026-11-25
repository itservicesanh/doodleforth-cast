'use strict';

window.paintDoodleCanvas = function (canvas, context, strokes) {
  if (!context) return;
  const clientWidth = canvas.clientWidth, clientHeight = canvas.clientHeight;
  const box = clientWidth && clientHeight ? null : canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round((clientWidth || box.width) * dpr));
  const height = Math.max(1, Math.round((clientHeight || box.height) * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
  // Letterbox to 16:9 so strokes are never geometrically distorted by a phone viewport.
  const cw = Math.min(width, height * (16 / 9));
  const ch = cw * 9 / 16;
  const ox = (width - cw) / 2, oy = (height - ch) / 2;
  for (const stroke of strokes) {
    if (!Array.isArray(stroke.points) || !stroke.points.length) continue;
    if (stroke.tool === 'clear') {
      context.fillStyle = '#ffffff'; context.fillRect(ox, oy, cw, ch); continue;
    }
    if (stroke.tool === 'fill') {
      context.fillStyle = /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : '#202024';
      context.beginPath();
      const spans = stroke.fillSpans || [];
      for (let i = 0, count = Math.min(spans.length, 12000); i < count; i++) {
        const span = spans[i];
        if (![span.x, span.y, span.length].every(Number.isInteger) || span.x < 0 || span.y < 0 || span.y >= 288 || span.length <= 0 || span.x + span.length > 512) continue;
        context.rect(ox + span.x / 512 * cw, oy + span.y / 288 * ch, span.length / 512 * cw, ch / 288);
      }
      context.fill(); // One unioned path prevents seams between adjacent span rows.
      continue;
    }
    const points = stroke.points;
    const px = p => ox + Math.max(0, Math.min(1, Number(p.x) || 0)) * cw;
    const py = p => oy + Math.max(0, Math.min(1, Number(p.y) || 0)) * ch;
    const sw = Math.max(.001, Math.min(.035, Number(stroke.width) || .008)) * cw;
    context.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : '#202024';
    context.fillStyle = context.strokeStyle;
    context.lineWidth = sw;
    context.lineCap = 'round'; context.lineJoin = 'round';
    if (points.length === 1) { context.beginPath(); context.arc(px(points[0]), py(points[0]), sw / 2, 0, Math.PI * 2); context.fill(); continue; }
    context.beginPath(); context.moveTo(px(points[0]), py(points[0]));
    for (let i = 1; i < points.length; i++) context.lineTo(px(points[i]), py(points[i]));
    context.stroke();
  }
};

// Draws only the newest part of a line on top of what is already painted, so
// live ink costs a few segments per frame instead of a full redraw. Returns
// false when a full paintDoodleCanvas is needed instead (canvas resized, or a
// stroke type that cannot be extended).
window.paintDoodleSegment = function (canvas, context, stroke, fromIndex) {
  if (!context || !stroke || !Array.isArray(stroke.points)) return false;
  if (stroke.tool === 'clear' || stroke.tool === 'fill') return false;
  const clientWidth = canvas.clientWidth, clientHeight = canvas.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!clientWidth || !clientHeight) return false;
  const width = Math.max(1, Math.round(clientWidth * dpr));
  const height = Math.max(1, Math.round(clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) return false;
  const points = stroke.points;
  const start = Math.max(0, fromIndex - 1);
  if (points.length - start < 2) return true; // Nothing new to join yet.
  const cw = Math.min(width, height * (16 / 9));
  const ch = cw * 9 / 16;
  const ox = (width - cw) / 2, oy = (height - ch) / 2;
  const px = p => ox + Math.max(0, Math.min(1, Number(p.x) || 0)) * cw;
  const py = p => oy + Math.max(0, Math.min(1, Number(p.y) || 0)) * ch;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : '#202024';
  context.lineWidth = Math.max(.001, Math.min(.035, Number(stroke.width) || .008)) * cw;
  context.lineCap = 'round'; context.lineJoin = 'round';
  context.beginPath(); context.moveTo(px(points[start]), py(points[start]));
  for (let i = start + 1; i < points.length; i++) context.lineTo(px(points[i]), py(points[i]));
  context.stroke();
  return true;
};
