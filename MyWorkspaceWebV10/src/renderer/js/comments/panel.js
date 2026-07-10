import { t, onUiLanguageChange } from '../i18n/index.js';
import { showApiError } from '../errors/errorDetail.js';
import { showConfirmDialog, openModal, closeModal, createButton } from '../dialogs/modals.js';

const MAX_PENDING_ATTACHMENTS = 10;

export function createCommentsPanel(container, api) {
  let currentPageId = null;
  let pendingQuote = '';
  let pendingParentId = null;
  let pendingReplyToUsername = '';
  let pendingAttachments = [];
  let notificationContext = null;
  const attachmentUrlCache = new Map();

  const notificationBanner = document.createElement('div');
  notificationBanner.className = 'comments-notification-banner hidden';

  const notificationBannerContent = document.createElement('div');
  notificationBannerContent.className = 'comments-notification-banner-content';

  const notificationBannerDismiss = document.createElement('button');
  notificationBannerDismiss.type = 'button';
  notificationBannerDismiss.className = 'comments-notification-dismiss';
  notificationBannerDismiss.addEventListener('click', () => {
    clearNotificationContext();
  });
  notificationBanner.append(notificationBannerContent, notificationBannerDismiss);

  const listEl = document.createElement('div');
  listEl.className = 'comments-list';

  const compose = document.createElement('div');
  compose.className = 'comments-compose';

  const replyBanner = document.createElement('div');
  replyBanner.className = 'comments-reply-banner hidden';

  const replyBannerText = document.createElement('span');
  replyBannerText.className = 'comments-reply-banner-text';

  const replyBannerCancel = document.createElement('button');
  replyBannerCancel.type = 'button';
  replyBannerCancel.className = 'comments-reply-banner-cancel';
  replyBanner.append(replyBannerText, replyBannerCancel);

  const textarea = document.createElement('textarea');
  textarea.className = 'comments-input';

  const pendingList = document.createElement('div');
  pendingList.className = 'comments-pending-attachments hidden';

  const toolbar = document.createElement('div');
  toolbar.className = 'comments-compose-toolbar';

  const attachImageBtn = document.createElement('button');
  attachImageBtn.type = 'button';
  attachImageBtn.className = 'comment-attach-btn';

  const attachFileBtn = document.createElement('button');
  attachFileBtn.type = 'button';
  attachFileBtn.className = 'comment-attach-btn';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn-primary comments-submit';

  toolbar.append(attachImageBtn, attachFileBtn, submitBtn);
  compose.append(replyBanner, textarea, toolbar, pendingList);
  container.replaceChildren(notificationBanner, listEl, compose);

  const ATTACHMENT_ONLY_NOTIFICATION_BODY = '첨부 파일이 포함된 댓글입니다.';

  function normalizeNotificationText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function clearNotificationContext() {
    notificationContext = null;
    notificationBanner.classList.add('hidden');
    notificationBannerContent.replaceChildren();
    for (const item of listEl.querySelectorAll('.comment-item.is-notification-target')) {
      item.classList.remove('is-notification-target');
    }
  }

  function renderNotificationBanner() {
    if (!notificationContext) {
      notificationBanner.classList.add('hidden');
      notificationBannerContent.replaceChildren();
      return;
    }

    notificationBanner.classList.remove('hidden');
    notificationBannerDismiss.textContent = t.notificationsContextDismiss;
    notificationBannerDismiss.setAttribute('aria-label', t.notificationsContextDismiss);

    notificationBannerContent.replaceChildren();

    const titleEl = document.createElement('strong');
    titleEl.className = 'comments-notification-title';
    titleEl.textContent = notificationContext.title;

    const bodyEl = document.createElement('p');
    bodyEl.className = 'comments-notification-body';
    bodyEl.textContent = notificationContext.body;

    const metaEl = document.createElement('span');
    metaEl.className = 'comments-notification-meta';
    metaEl.textContent = `${notificationContext.actorUsername} · ${notificationContext.createdAt}`;

    notificationBannerContent.append(titleEl, bodyEl, metaEl);
  }

  function pickClosestCommentByTime(comments, createdAt) {
    if (!comments.length) {
      return null;
    }

    const targetTime = Date.parse(createdAt);
    if (!Number.isFinite(targetTime)) {
      return comments[comments.length - 1];
    }

    return comments.reduce((closest, comment) => {
      const commentTime = Date.parse(comment.createdAt);
      if (!Number.isFinite(commentTime)) {
        return closest;
      }
      const closestTime = Date.parse(closest.createdAt);
      if (!Number.isFinite(closestTime)) {
        return comment;
      }
      return Math.abs(commentTime - targetTime) < Math.abs(closestTime - targetTime) ? comment : closest;
    });
  }

  function findMatchingCommentId(comments, notification) {
    const actor = notification.actorUsername;
    const body = normalizeNotificationText(notification.body);
    const candidates = comments.filter((comment) => comment.authorUsername === actor);
    if (!candidates.length) {
      return null;
    }

    if (body === ATTACHMENT_ONLY_NOTIFICATION_BODY) {
      const withAttachments = candidates.filter((comment) => comment.attachments?.length);
      return pickClosestCommentByTime(withAttachments.length ? withAttachments : candidates, notification.createdAt)?.id
        ?? null;
    }

    const directMatch = candidates.find((comment) => {
      const content = normalizeNotificationText(comment.content);
      if (!content) {
        return false;
      }
      return content.startsWith(body) || body.startsWith(content.slice(0, 120)) || content.includes(body);
    });
    if (directMatch) {
      return directMatch.id;
    }

    return pickClosestCommentByTime(candidates, notification.createdAt)?.id ?? null;
  }

  function highlightNotificationComment(commentId) {
    for (const item of listEl.querySelectorAll('.comment-item.is-notification-target')) {
      item.classList.remove('is-notification-target');
    }
    if (!commentId) {
      return;
    }

    const target = listEl.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (!target) {
      return;
    }

    target.classList.add('is-notification-target');
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function applyNotificationContext(comments) {
    renderNotificationBanner();
    if (!notificationContext) {
      return;
    }
    highlightNotificationComment(findMatchingCommentId(comments, notificationContext));
  }

  function updateComposeLabels() {
    const input = compose.querySelector('.comments-input') || textarea;
    const submit = compose.querySelector('.comments-submit') || submitBtn;
    input.placeholder = t.commentsInputPlaceholder;
    submit.textContent = t.commentsSubmit;
    attachImageBtn.textContent = t.commentsAttachImage;
    attachFileBtn.textContent = t.commentsAttachFile;
    attachImageBtn.title = t.commentsAttachImage;
    attachFileBtn.title = t.commentsAttachFile;
    compose.title = t.commentsDropHint;
    replyBannerCancel.textContent = t.commentsCancelReply;
    updateReplyBanner();
    if (notificationContext) {
      notificationBannerDismiss.textContent = t.notificationsContextDismiss;
      notificationBannerDismiss.setAttribute('aria-label', t.notificationsContextDismiss);
    }
  }

  function clearReplyTarget() {
    pendingParentId = null;
    pendingReplyToUsername = '';
    updateReplyBanner();
  }

  function setReplyTarget(comment) {
    pendingParentId = comment.id;
    pendingReplyToUsername = comment.authorUsername;
    updateReplyBanner();
    textarea.focus();
  }

  function updateReplyBanner() {
    if (!pendingParentId || !pendingReplyToUsername) {
      replyBanner.classList.add('hidden');
      replyBannerText.textContent = '';
      return;
    }

    replyBanner.classList.remove('hidden');
    replyBannerText.textContent = t.commentsReplyingTo(pendingReplyToUsername);
  }

  function clearPendingAttachments() {
    for (const attachment of pendingAttachments) {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    }
    pendingAttachments = [];
    pendingList.replaceChildren();
    pendingList.classList.add('hidden');
  }

  function buildPendingAttachmentEntry(attachment) {
    const entry = {
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      dataBase64: attachment.dataBase64,
      isImage: Boolean(attachment.isImage),
      previewUrl: null
    };

    if (entry.isImage) {
      try {
        entry.previewUrl = `data:${entry.contentType};base64,${entry.dataBase64}`;
      } catch {
        entry.previewUrl = null;
      }
    }

    return entry;
  }

  function getAttachmentTotalCount(existingAttachments = [], removedIds = new Set(), pendingNew = []) {
    const keptExisting = existingAttachments.filter((attachment) => !removedIds.has(attachment.id)).length;
    return keptExisting + pendingNew.length;
  }

  function renderAttachmentChipList(container, attachments, { onRemove }) {
    container.replaceChildren();
    if (!attachments.length) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    for (const [index, attachment] of attachments.entries()) {
      const item = document.createElement('div');
      item.className = 'comments-pending-item';

      if (attachment.isImage && attachment.previewUrl) {
        const image = document.createElement('img');
        image.className = 'comments-pending-thumb';
        image.src = attachment.previewUrl;
        image.alt = attachment.fileName;
        item.appendChild(image);
      } else {
        const label = document.createElement('span');
        label.className = 'comments-pending-name';
        label.textContent = attachment.fileName;
        item.appendChild(label);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'comments-pending-remove';
      removeBtn.textContent = '×';
      removeBtn.title = t.commentsAttachmentRemove;
      removeBtn.setAttribute('aria-label', t.commentsAttachmentRemove);
      removeBtn.addEventListener('click', () => onRemove(index));
      item.appendChild(removeBtn);
      container.appendChild(item);
    }
  }

  async function showEditCommentDialog(comment) {
    return new Promise((resolve) => {
      const removedAttachmentIds = new Set();
      const pendingNewAttachments = [];
      const existingAttachments = comment.attachments || [];

      const body = document.createElement('div');
      body.className = 'comments-compose comments-edit-compose';

      const textarea = document.createElement('textarea');
      textarea.className = 'comments-input';
      textarea.value = comment.content || '';

      const existingSection = document.createElement('div');
      existingSection.className = 'comments-edit-section hidden';
      const existingLabel = document.createElement('p');
      existingLabel.className = 'comments-edit-section-label';
      existingLabel.textContent = t.commentsExistingAttachments;
      const existingList = document.createElement('div');
      existingList.className = 'comments-pending-attachments';
      existingSection.append(existingLabel, existingList);

      const pendingSection = document.createElement('div');
      pendingSection.className = 'comments-edit-section hidden';
      const pendingLabel = document.createElement('p');
      pendingLabel.className = 'comments-edit-section-label';
      pendingLabel.textContent = t.commentsNewAttachments;
      const pendingList = document.createElement('div');
      pendingList.className = 'comments-pending-attachments hidden';
      pendingSection.append(pendingLabel, pendingList);

      const toolbar = document.createElement('div');
      toolbar.className = 'comments-compose-toolbar';

      const attachImageBtn = document.createElement('button');
      attachImageBtn.type = 'button';
      attachImageBtn.className = 'comment-attach-btn';
      attachImageBtn.textContent = t.commentsAttachImage;

      const attachFileBtn = document.createElement('button');
      attachFileBtn.type = 'button';
      attachFileBtn.className = 'comment-attach-btn';
      attachFileBtn.textContent = t.commentsAttachFile;

      toolbar.append(attachImageBtn, attachFileBtn);
      body.append(textarea, existingSection, pendingSection, toolbar);

      const finish = (value) => {
        for (const attachment of pendingNewAttachments) {
          if (attachment.previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        }
        closeModal();
        resolve(value);
      };

      const renderPendingNew = () => {
        renderAttachmentChipList(pendingList, pendingNewAttachments, {
          onRemove: (index) => {
            const [removed] = pendingNewAttachments.splice(index, 1);
            if (removed?.previewUrl?.startsWith('blob:')) {
              URL.revokeObjectURL(removed.previewUrl);
            }
            if (pendingNewAttachments.length) {
              pendingSection.classList.remove('hidden');
            } else {
              pendingSection.classList.add('hidden');
            }
            renderPendingNew();
          }
        });
        pendingSection.classList.toggle('hidden', !pendingNewAttachments.length);
      };

      const renderExisting = async () => {
        const visibleExisting = existingAttachments
          .filter((attachment) => !removedAttachmentIds.has(attachment.id))
          .map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName,
            isImage: attachment.isImage,
            previewUrl: null
          }));

        for (const attachment of visibleExisting) {
          if (attachment.isImage) {
            attachment.previewUrl = await getAttachmentDataUrl(attachment.id);
          }
        }

        existingSection.classList.toggle('hidden', !visibleExisting.length);
        renderAttachmentChipList(existingList, visibleExisting, {
          onRemove: (index) => {
            const attachment = visibleExisting[index];
            if (attachment?.id) {
              removedAttachmentIds.add(attachment.id);
            }
            void renderExisting();
          }
        });
      };

      const canAddMoreAttachments = () =>
        getAttachmentTotalCount(existingAttachments, removedAttachmentIds, pendingNewAttachments)
        < MAX_PENDING_ATTACHMENTS;

      const addNewAttachment = (attachment) => {
        if (!canAddMoreAttachments()) {
          return false;
        }
        pendingNewAttachments.push(buildPendingAttachmentEntry(attachment));
        renderPendingNew();
        return true;
      };

      const pickForEdit = async (imageOnly) => {
        if (!canAddMoreAttachments()) {
          return;
        }
        const result = await api.pickCommentAttachment(imageOnly);
        if (result?.cancelled) {
          return;
        }
        if (!result?.ok || !result.attachment) {
          showApiError(t.commentsAttachmentErrorTitle, result);
          return;
        }
        addNewAttachment(result.attachment);
      };

      const importForEdit = async (files) => {
        for (const file of files) {
          if (!canAddMoreAttachments()) {
            break;
          }
          const dataUri = await readFileAsDataUri(file);
          const result = await api.importCommentAttachmentDataUri(dataUri, file.name);
          if (!result?.ok || !result.attachment) {
            showApiError(t.commentsAttachmentErrorTitle, result);
            continue;
          }
          addNewAttachment(result.attachment);
        }
      };

      const submit = () => {
        const content = textarea.value;
        const attachments = pendingNewAttachments.map((attachment) => ({
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          dataBase64: attachment.dataBase64
        }));
        const removeIds = [...removedAttachmentIds];

        if (
          !content.trim()
          && getAttachmentTotalCount(existingAttachments, removedAttachmentIds, pendingNewAttachments) === 0
        ) {
          return;
        }

        finish({
          content,
          attachments,
          removeAttachmentIds: removeIds
        });
      };

      attachImageBtn.addEventListener('click', () => {
        void pickForEdit(true);
      });
      attachFileBtn.addEventListener('click', () => {
        void pickForEdit(false);
      });

      body.addEventListener('dragover', (event) => {
        event.preventDefault();
        body.classList.add('is-drop-target');
      });
      body.addEventListener('dragleave', (event) => {
        if (!body.contains(event.relatedTarget)) {
          body.classList.remove('is-drop-target');
        }
      });
      body.addEventListener('drop', (event) => {
        event.preventDefault();
        body.classList.remove('is-drop-target');
        const files = [...(event.dataTransfer?.files || [])];
        if (files.length) {
          void importForEdit(files);
        }
      });
      body.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          submit();
        }
      });

      const saveButton = createButton(t.buttonSave, { primary: true, onClick: submit });
      saveButton.classList.add('pastel-save-btn');

      openModal({
        title: t.commentsEditTitle,
        bodyNode: body,
        cardClassName: 'modal-card--compact comments-edit-modal-card',
        footerNodes: [
          createButton(t.buttonCancel, { onClick: () => finish(null) }),
          saveButton
        ]
      });

      void renderExisting();
      textarea.focus();
    });
  }

  function canAddPendingAttachment() {
    return pendingAttachments.length < MAX_PENDING_ATTACHMENTS;
  }

  function renderPendingAttachments() {
    pendingList.replaceChildren();
    if (!pendingAttachments.length) {
      pendingList.classList.add('hidden');
      return;
    }

    pendingList.classList.remove('hidden');
    for (const [index, attachment] of pendingAttachments.entries()) {
      const item = document.createElement('div');
      item.className = 'comments-pending-item';

      if (attachment.isImage && attachment.previewUrl) {
        const image = document.createElement('img');
        image.className = 'comments-pending-thumb';
        image.src = attachment.previewUrl;
        image.alt = attachment.fileName;
        item.appendChild(image);
      } else {
        const label = document.createElement('span');
        label.className = 'comments-pending-name';
        label.textContent = attachment.fileName;
        item.appendChild(label);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'comments-pending-remove';
      removeBtn.textContent = '×';
      removeBtn.title = t.commentsAttachmentRemove;
      removeBtn.setAttribute('aria-label', t.commentsAttachmentRemove);
      removeBtn.addEventListener('click', () => {
        const [removed] = pendingAttachments.splice(index, 1);
        if (removed?.previewUrl) {
          URL.revokeObjectURL(removed.previewUrl);
        }
        renderPendingAttachments();
      });
      item.appendChild(removeBtn);
      pendingList.appendChild(item);
    }
  }

  function addPendingAttachment(attachment) {
    if (!canAddPendingAttachment()) {
      return false;
    }

    const entry = buildPendingAttachmentEntry(attachment);

    pendingAttachments.push(entry);
    renderPendingAttachments();
    return true;
  }

  async function pickAttachment(imageOnly) {
    if (!canAddPendingAttachment()) {
      return;
    }

    const result = await api.pickCommentAttachment(imageOnly);
    if (result?.cancelled) {
      return;
    }
    if (!result?.ok || !result.attachment) {
      showApiError(t.commentsAttachmentErrorTitle, result);
      return;
    }

    addPendingAttachment(result.attachment);
  }

  async function importDroppedFiles(files) {
    for (const file of files) {
      if (!canAddPendingAttachment()) {
        break;
      }

      const dataUri = await readFileAsDataUri(file);
      const result = await api.importCommentAttachmentDataUri(dataUri, file.name);
      if (!result?.ok || !result.attachment) {
        showApiError(t.commentsAttachmentErrorTitle, result);
        continue;
      }
      addPendingAttachment(result.attachment);
    }
  }

  async function getAttachmentDataUrl(attachmentId) {
    if (attachmentUrlCache.has(attachmentId)) {
      return attachmentUrlCache.get(attachmentId);
    }

    const result = await api.getCommentAttachmentBytes(attachmentId);
    if (!result?.ok) {
      return null;
    }

    const url = `data:${result.mime};base64,${result.bytes}`;
    attachmentUrlCache.set(attachmentId, url);
    return url;
  }

  async function populateCommentAttachments(containerEl, attachments = []) {
    containerEl.replaceChildren();
    if (!attachments.length) {
      containerEl.classList.add('hidden');
      return;
    }

    containerEl.classList.remove('hidden');
    for (const attachment of attachments) {
      if (attachment.isImage) {
        const image = document.createElement('img');
        image.className = 'comment-attachment-image';
        image.alt = attachment.fileName;
        image.loading = 'lazy';
        image.title = attachment.fileName;
        const dataUrl = await getAttachmentDataUrl(attachment.id);
        if (dataUrl) {
          image.src = dataUrl;
        }
        image.addEventListener('click', () => {
          void api.openCommentAttachment(attachment.id);
        });
        containerEl.appendChild(image);
        continue;
      }

      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'comment-attachment-file';
      link.textContent = attachment.fileName;
      link.title = t.commentsOpenAttachment;
      link.addEventListener('click', () => {
        void api.openCommentAttachment(attachment.id);
      });
      containerEl.appendChild(link);
    }
  }

  function refreshLocalizedPanelUi() {
    updateComposeLabels();

    const placeholder = listEl.querySelector('.comments-placeholder');
    if (placeholder) {
      placeholder.textContent = currentPageId == null
        ? t.commentsSelectPage
        : t.commentsEmpty;
    }

    for (const editButton of listEl.querySelectorAll('.comment-action-edit')) {
      editButton.textContent = t.commentsEdit;
    }
    for (const deleteButton of listEl.querySelectorAll('.comment-action-delete')) {
      deleteButton.textContent = t.commentsDelete;
    }
    for (const replyButton of listEl.querySelectorAll('.comment-action-reply')) {
      replyButton.textContent = t.commentsReply;
    }
    for (const idLine of listEl.querySelectorAll('.comment-author-id')) {
      const username = idLine.dataset.authorUsername;
      if (username) {
        idLine.textContent = t.commentsAuthorId(username);
      }
    }
    for (const replyLabel of listEl.querySelectorAll('.comment-reply-to')) {
      const username = replyLabel.dataset.replyTo;
      if (username) {
        replyLabel.textContent = t.commentsReplyingTo(username);
      }
    }
    for (const fileButton of listEl.querySelectorAll('.comment-attachment-file')) {
      fileButton.title = t.commentsOpenAttachment;
    }
    for (const removeButton of pendingList.querySelectorAll('.comments-pending-remove')) {
      removeButton.title = t.commentsAttachmentRemove;
      removeButton.setAttribute('aria-label', t.commentsAttachmentRemove);
    }
    renderPendingAttachments();
  }

  function renderSelectPagePlaceholder() {
    listEl.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'comments-placeholder';
    empty.textContent = t.commentsSelectPage;
    listEl.appendChild(empty);
  }

  function buildCommentTree(comments) {
    const nodes = new Map();
    const roots = [];

    for (const comment of comments) {
      nodes.set(comment.id, { ...comment, replies: [] });
    }

    for (const comment of comments) {
      const node = nodes.get(comment.id);
      if (comment.parentId && nodes.has(comment.parentId)) {
        nodes.get(comment.parentId).replies.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async function refresh() {
    try {
      if (currentPageId == null) {
        renderSelectPagePlaceholder();
        compose.classList.add('hidden');
        clearPendingAttachments();
        clearReplyTarget();
        clearNotificationContext();
        return;
      }

      compose.classList.remove('hidden');
      const result = await api.getComments(currentPageId);
      if (!result.ok) {
        showApiError(t.commentsErrorTitle, result);
        return;
      }

      listEl.replaceChildren();
      if (!result.comments.length) {
        const empty = document.createElement('p');
        empty.className = 'comments-placeholder';
        empty.textContent = t.commentsEmpty;
        listEl.appendChild(empty);
        applyNotificationContext(result.comments);
        return;
      }

      const tree = buildCommentTree(result.comments);
      for (const comment of tree) {
        listEl.appendChild(renderCommentThread(comment));
      }
      applyNotificationContext(result.comments);
    } finally {
      updateComposeLabels();
    }
  }

  function renderCommentThread(comment) {
    const thread = document.createElement('div');
    thread.className = 'comment-thread';
    thread.appendChild(renderComment(comment));

    if (comment.replies?.length) {
      const repliesEl = document.createElement('div');
      repliesEl.className = 'comment-replies';
      for (const reply of comment.replies) {
        repliesEl.appendChild(renderCommentThread(reply));
      }
      thread.appendChild(repliesEl);
    }

    return thread;
  }

  function applyCommentDepthStyle(item, depth = 0) {
    if (depth <= 0) {
      return;
    }

    item.classList.add('comment-item-reply');
    item.dataset.depth = String(depth);
    item.style.setProperty('--comment-depth', String(depth));
  }

  function buildCommentHeader(comment) {
    const header = document.createElement('div');
    header.className = 'comment-header';

    const authorMeta = document.createElement('div');
    authorMeta.className = 'comment-author-meta';

    const username = comment.authorUsername || '';
    const displayName = comment.authorDisplayName || '';
    const showDisplayName = Boolean(displayName && displayName !== username);

    if (showDisplayName) {
      const nameEl = document.createElement('strong');
      nameEl.className = 'comment-author-name';
      nameEl.textContent = displayName;
      authorMeta.appendChild(nameEl);
    }

    if (username) {
      const idEl = document.createElement('span');
      idEl.className = showDisplayName ? 'comment-author-id' : 'comment-author-id is-primary-id';
      idEl.dataset.authorUsername = username;
      idEl.textContent = t.commentsAuthorId(username);
      authorMeta.appendChild(idEl);
    }

    const dateEl = document.createElement('span');
    dateEl.className = 'comment-date';
    dateEl.textContent = comment.createdAt || '';

    header.append(authorMeta, dateEl);
    return header;
  }

  function renderComment(comment) {
    const item = document.createElement('article');
    item.className = 'comment-item';
    item.dataset.commentId = String(comment.id);
    applyCommentDepthStyle(item, comment.depth || 0);

    const header = buildCommentHeader(comment);

    const body = document.createElement('div');
    body.className = 'comment-body';

    if (comment.replyToUsername) {
      const replyTo = document.createElement('div');
      replyTo.className = 'comment-reply-to';
      replyTo.dataset.replyTo = comment.replyToUsername;
      replyTo.textContent = t.commentsReplyingTo(comment.replyToUsername);
      body.appendChild(replyTo);
    }

    if (comment.quotedText) {
      const quote = document.createElement('blockquote');
      quote.className = 'comment-quote';
      quote.textContent = comment.quotedText;
      body.appendChild(quote);
    }

    if (comment.content) {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = escapeHtml(comment.content).replace(/\n/g, '<br>');
      body.appendChild(paragraph);
    }

    const attachmentsEl = document.createElement('div');
    attachmentsEl.className = 'comment-attachments hidden';
    body.appendChild(attachmentsEl);
    void populateCommentAttachments(attachmentsEl, comment.attachments || []);

    const actions = document.createElement('div');
    actions.className = 'comment-actions';

    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'comment-action comment-action-reply';
    replyBtn.textContent = t.commentsReply;
    replyBtn.addEventListener('click', () => {
      setReplyTarget(comment);
    });
    actions.appendChild(replyBtn);

    if (comment.canEdit) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'comment-action comment-action-edit';
      editBtn.textContent = t.commentsEdit;
      editBtn.addEventListener('click', async () => {
        const payload = await showEditCommentDialog(comment);
        if (!payload) {
          return;
        }
        const updated = await api.updateComment(
          comment.id,
          payload.content,
          payload.attachments,
          payload.removeAttachmentIds
        );
        if (!updated.ok) {
          showApiError(t.commentsUpdateErrorTitle, updated);
          return;
        }
        await refresh();
      });
      actions.appendChild(editBtn);
    }

    if (comment.canDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'comment-action comment-action-delete';
      deleteBtn.textContent = t.commentsDelete;
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog({
          title: t.commentsDeleteTitle,
          message: t.commentsDeleteConfirm,
          confirmLabel: t.commentsDelete,
          danger: true
        });
        if (!confirmed) {
          return;
        }
        const deleted = await api.deleteComment(comment.id);
        if (!deleted.ok) {
          showApiError(t.commentsDeleteErrorTitle, deleted);
          return;
        }
        if (pendingParentId === comment.id) {
          clearReplyTarget();
        }
        await refresh();
      });
      actions.appendChild(deleteBtn);
    }

    item.append(header, body, actions);
    return item;
  }

  async function submitComment() {
    if (currentPageId == null) {
      return;
    }

    const content = textarea.value;
    const attachments = pendingAttachments.map((attachment) => ({
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      dataBase64: attachment.dataBase64
    }));

    if (!content.trim() && !attachments.length) {
      return;
    }

    const result = await api.addComment(
      currentPageId,
      content,
      pendingQuote || undefined,
      attachments,
      pendingParentId || undefined
    );
    if (!result.ok) {
      showApiError(t.commentsAddErrorTitle, result);
      return;
    }

    textarea.value = '';
    pendingQuote = '';
    clearReplyTarget();
    clearPendingAttachments();
    await refresh();
  }

  replyBannerCancel.addEventListener('click', () => {
    clearReplyTarget();
  });

  attachImageBtn.addEventListener('click', () => {
    void pickAttachment(true);
  });

  attachFileBtn.addEventListener('click', () => {
    void pickAttachment(false);
  });

  submitBtn.addEventListener('click', () => {
    void submitComment();
  });

  compose.addEventListener('dragover', (event) => {
    event.preventDefault();
    compose.classList.add('is-drop-target');
  });

  compose.addEventListener('dragleave', (event) => {
    if (!compose.contains(event.relatedTarget)) {
      compose.classList.remove('is-drop-target');
    }
  });

  compose.addEventListener('drop', (event) => {
    event.preventDefault();
    compose.classList.remove('is-drop-target');
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length) {
      void importDroppedFiles(files);
    }
  });

  updateComposeLabels();
  renderSelectPagePlaceholder();
  compose.classList.add('hidden');
  onUiLanguageChange(() => {
    refreshLocalizedPanelUi();
  });

  return {
    setPage(pageId) {
      currentPageId = pageId;
      pendingQuote = '';
      clearReplyTarget();
      clearPendingAttachments();
      clearNotificationContext();
      refresh();
    },
    async showNotificationContext(notification) {
      notificationContext = notification;
      await refresh();
    },
    composeWithQuote(quotedText) {
      pendingQuote = quotedText || '';
      clearReplyTarget();
      textarea.value = '';
      textarea.focus();
    },
    refresh,
    refreshLocalizedUi: refreshLocalizedPanelUi
  };
}

function readFileAsDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
