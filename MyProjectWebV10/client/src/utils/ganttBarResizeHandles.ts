import { GANTT_BAR_RESIZE_HANDLE_WIDTH } from '../config/ganttLayout';

type FrappeBarLike = {
  invalid?: boolean;
  $bar: SVGGraphicsElement;
  handle_group: Element;
  gantt: { options: { readonly?: boolean } };
};

let resizeHandlePatchApplied = false;

function applyResizeHandleGeometry(
  handle: SVGRectElement,
  side: 'left' | 'right',
  bar: SVGGraphicsElement,
): void {
  const bbox = bar.getBBox();
  const width = GANTT_BAR_RESIZE_HANDLE_WIDTH;

  handle.setAttribute('width', String(width));
  handle.setAttribute('height', String(bbox.height));
  handle.setAttribute('y', String(bbox.y));
  handle.setAttribute('rx', '2');
  handle.setAttribute('ry', '2');
  handle.setAttribute(
    'x',
    String(
      side === 'left'
        ? bbox.x - width / 2
        : bbox.x + bbox.width - width / 2,
    ),
  );
}

export function applyGanttBarResizeHandlesToBar(bar: FrappeBarLike): void {
  if (bar.invalid || bar.gantt.options.readonly) return;

  const left = bar.handle_group.querySelector('.handle.left');
  const right = bar.handle_group.querySelector('.handle.right');

  if (left instanceof SVGRectElement) {
    applyResizeHandleGeometry(left, 'left', bar.$bar);
  }
  if (right instanceof SVGRectElement) {
    applyResizeHandleGeometry(right, 'right', bar.$bar);
  }
}

/** Keep frappe-gantt handle positions aligned with the enlarged hit areas during drag. */
export function patchFrappeGanttResizeHandles(
  gantt: { bars?: FrappeBarLike[] } | null,
): void {
  if (resizeHandlePatchApplied || !gantt?.bars?.[0]) return;

  const proto = Object.getPrototypeOf(gantt.bars[0]) as {
    update_handle_position?: () => void;
    draw_resize_handles?: () => void;
    __resizeHandlePatch?: boolean;
  };

  if (proto.__resizeHandlePatch) return;

  const originalUpdate = proto.update_handle_position;
  if (typeof originalUpdate === 'function') {
    proto.update_handle_position = function (this: FrappeBarLike) {
      originalUpdate.call(this);
      applyGanttBarResizeHandlesToBar(this);
    };
  }

  const originalDraw = proto.draw_resize_handles;
  if (typeof originalDraw === 'function') {
    proto.draw_resize_handles = function (this: FrappeBarLike) {
      originalDraw.call(this);
      applyGanttBarResizeHandlesToBar(this);
    };
  }

  proto.__resizeHandlePatch = true;
  resizeHandlePatchApplied = true;
}

export function applyGanttBarResizeHandles(container: HTMLElement): void {
  container.querySelectorAll('.bar-wrapper').forEach((wrapper) => {
    if (wrapper.classList.contains('gantt-milestone')) return;

    const bar = wrapper.querySelector('.bar-group .bar');
    const handleGroup = wrapper.querySelector('.handle-group');
    if (!(bar instanceof SVGGraphicsElement) || !handleGroup) return;

    applyGanttBarResizeHandlesToBar({
      $bar: bar,
      handle_group: handleGroup,
      gantt: { options: { readonly: false } },
    });
  });
}
