import { showApiError } from '../errors/errorDetail.js';
import { showConfirmDialog, showInputDialog } from '../dialogs/modals.js';

export function createCommentsPanel(container, api) {
  let currentPageId = null;
  let pendingQuote = '';

  const listEl = document.createElement('div');
  listEl.className = 'comments-list';

  const compose = document.createElement('div');
  compose.className = 'comments-compose';
  const textarea = document.createElement('textarea');
  textarea.className = 'comments-input';
  textarea.placeholder = '댓글을 입력하세요.';
  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn-primary comments-submit';
  submitBtn.textContent = '등록';

  compose.append(textarea, submitBtn);
  container.replaceChildren(listEl, compose);

  async function refresh() {
    if (currentPageId == null) {
      listEl.innerHTML = '<p class="comments-placeholder">Page를 선택하면 댓글을 볼 수 있습니다.</p>';
      compose.classList.add('hidden');
      return;
    }

    compose.classList.remove('hidden');
    const result = await api.getComments(currentPageId);
    if (!result.ok) {
      showApiError('댓글', result);
      return;
    }

    listEl.replaceChildren();
    if (!result.comments.length) {
      const empty = document.createElement('p');
      empty.className = 'comments-placeholder';
      empty.textContent = '아직 댓글이 없습니다.';
      listEl.appendChild(empty);
      return;
    }

    for (const comment of result.comments) {
      listEl.appendChild(renderComment(comment));
    }
  }

  function renderComment(comment) {
    const item = document.createElement('article');
    item.className = 'comment-item';
    item.dataset.commentId = String(comment.id);

    const header = document.createElement('div');
    header.className = 'comment-header';
    header.innerHTML = `<strong>${escapeHtml(comment.authorUsername)}</strong><span>${escapeHtml(comment.createdAt)}</span>`;

    const quote = comment.quotedText
      ? `<blockquote class="comment-quote">${escapeHtml(comment.quotedText)}</blockquote>`
      : '';
    const body = document.createElement('div');
    body.className = 'comment-body';
    body.innerHTML = `${quote}<p>${escapeHtml(comment.content).replace(/\n/g, '<br>')}</p>`;

    const actions = document.createElement('div');
    actions.className = 'comment-actions';

    if (comment.canEdit) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'comment-action';
      editBtn.textContent = '수정';
      editBtn.addEventListener('click', async () => {
        const content = await showInputDialog({
          title: '댓글 수정',
          label: '내용',
          defaultValue: comment.content,
          multiline: true
        });
        if (content == null) {
          return;
        }
        const updated = await api.updateComment(comment.id, content);
        if (!updated.ok) {
          showApiError('댓글 수정', updated);
          return;
        }
        await refresh();
      });
      actions.appendChild(editBtn);
    }

    if (comment.canDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'comment-action';
      deleteBtn.textContent = '삭제';
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog({
          title: '댓글 삭제',
          message: '이 댓글을 삭제할까요?',
          confirmLabel: '삭제',
          danger: true
        });
        if (!confirmed) {
          return;
        }
        const deleted = await api.deleteComment(comment.id);
        if (!deleted.ok) {
          showApiError('댓글 삭제', deleted);
          return;
        }
        await refresh();
      });
      actions.appendChild(deleteBtn);
    }

    item.append(header, body, actions);
    return item;
  }

  submitBtn.addEventListener('click', async () => {
    if (currentPageId == null) {
      return;
    }
    const content = textarea.value;
    const result = await api.addComment(currentPageId, content, pendingQuote || undefined);
    if (!result.ok) {
      showApiError('댓글 등록', result);
      return;
    }
    textarea.value = '';
    pendingQuote = '';
    await refresh();
  });

  return {
    setPage(pageId) {
      currentPageId = pageId;
      pendingQuote = '';
      refresh();
    },
    composeWithQuote(quotedText) {
      pendingQuote = quotedText || '';
      textarea.value = '';
      textarea.focus();
    },
    refresh
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
