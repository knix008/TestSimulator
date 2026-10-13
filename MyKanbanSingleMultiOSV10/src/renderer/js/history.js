/* Undo / Redo — kanban 편집 기록 */
const History = (() => {
  const MAX = 100;
  let undoStack = [];
  let redoStack = [];
  let activeBoardId = null;
  let applying = false;

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }
  function isApplying() { return applying; }

  function updateMenuState() {
    const undoEl = document.getElementById('mb-undo');
    const redoEl = document.getElementById('mb-redo');
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    const canU = canUndo();
    const canR = canRedo();
    if (undoEl) undoEl.classList.toggle('disabled', !canU);
    if (redoEl) redoEl.classList.toggle('disabled', !canR);
    if (undoBtn) undoBtn.classList.toggle('disabled', !canU);
    if (redoBtn) redoBtn.classList.toggle('disabled', !canR);
  }

  function clear() {
    undoStack = [];
    redoStack = [];
    updateMenuState();
  }

  function setBoard(boardId) {
    if (activeBoardId !== boardId) {
      activeBoardId = boardId ?? null;
      clear();
    }
  }

  function push(entry) {
    if (applying) return;
    undoStack.push(entry);
    if (undoStack.length > MAX) undoStack.shift();
    redoStack = [];
    updateMenuState();
  }

  async function afterApply(entry) {
    if (document.getElementById('ec-title') || document.getElementById('pick-assignee')) {
      Modal.forceClose();
    }
    if (entry.scope === 'boardList') {
      if (typeof BoardView !== 'undefined' && BoardView.renderBoardList) {
        await BoardView.renderBoardList();
      }
      return;
    }
    if (typeof BoardView !== 'undefined' && BoardView.reloadAfterHistory) {
      await BoardView.reloadAfterHistory();
    }
  }

  async function undo() {
    if (!canUndo()) {
      showToast(I18n.t('nothingToUndo'), 'info');
      return false;
    }
    const entry = undoStack.pop();
    applying = true;
    try {
      await entry.undo();
      redoStack.push(entry);
      await afterApply(entry);
      showToast(I18n.t('undone'), 'info');
      updateMenuState();
      return true;
    } catch (err) {
      undoStack.push(entry);
      showToast(err.message, 'error');
      return false;
    } finally {
      applying = false;
    }
  }

  async function redo() {
    if (!canRedo()) {
      showToast(I18n.t('nothingToRedo'), 'info');
      return false;
    }
    const entry = redoStack.pop();
    applying = true;
    try {
      await entry.redo();
      undoStack.push(entry);
      await afterApply(entry);
      showToast(I18n.t('redone'), 'info');
      updateMenuState();
      return true;
    } catch (err) {
      redoStack.push(entry);
      showToast(err.message, 'error');
      return false;
    } finally {
      applying = false;
    }
  }

  function cardPayloadToApi(payload) {
    return {
      title: payload.title,
      description: payload.description || null,
      assigneeId: payload.assigneeId || null,
      dueDate: payload.dueDate || null,
      bgColor: payload.bgColor || null,
      stripeColor: payload.stripeColor || null,
    };
  }

  function normalizeCardPayload(payload) {
    return {
      title: payload.title,
      description: payload.description || '',
      assigneeId: payload.assigneeId ? String(payload.assigneeId) : '',
      dueDate: payload.dueDate ? String(payload.dueDate).substring(0, 10) : '',
      bgColor: payload.bgColor || '',
      stripeColor: payload.stripeColor || '',
    };
  }

  function recordCardMove(boardId, cardId, fromCol, fromPos, toCol, toPos) {
    push({
      scope: 'board',
      boardId,
      undo: () => API.post(`/boards/${boardId}/cards/${cardId}/move`, {
        targetColumnId: fromCol,
        position: fromPos,
      }),
      redo: () => API.post(`/boards/${boardId}/cards/${cardId}/move`, {
        targetColumnId: toCol,
        position: toPos,
      }),
    });
  }

  function recordCardUpdate(boardId, cardId, before, after) {
    const prev = normalizeCardPayload(before);
    const next = normalizeCardPayload(after);
    if (JSON.stringify(prev) === JSON.stringify(next)) return;
    push({
      scope: 'board',
      boardId,
      undo: () => API.put(`/boards/${boardId}/cards/${cardId}`, cardPayloadToApi(prev)),
      redo: () => API.put(`/boards/${boardId}/cards/${cardId}`, cardPayloadToApi(next)),
    });
  }

  function recordCardCreate(boardId, cardId, data) {
    const entry = { scope: 'board', boardId, cardId };
    entry.undo = async () => {
      await API.delete(`/boards/${boardId}/cards/${entry.cardId}`);
    };
    entry.redo = async () => {
      const created = await API.post(`/boards/${boardId}/cards`, {
        columnId: data.columnId,
        title: data.title,
        description: data.description,
        assigneeId: data.assigneeId,
        dueDate: data.dueDate,
        bgColor: data.bgColor,
        stripeColor: data.stripeColor,
      });
      entry.cardId = created.id;
    };
    entry.cardId = cardId;
    push(entry);
  }

  function recordCardDelete(boardId, snapshot) {
    const entry = { scope: 'board', boardId, snapshot: { ...snapshot } };
    entry.undo = async () => {
      const created = await API.post(`/boards/${boardId}/cards`, {
        columnId: entry.snapshot.column_id,
        title: entry.snapshot.title,
        description: entry.snapshot.description,
        assigneeId: entry.snapshot.assignee_id,
        dueDate: entry.snapshot.due_date ? String(entry.snapshot.due_date).substring(0, 10) : null,
        bgColor: entry.snapshot.bg_color,
        stripeColor: entry.snapshot.stripe_color || entry.snapshot.color,
      });
      entry.restoredId = created.id;
      if (entry.snapshot.position > 0) {
        await API.post(`/boards/${boardId}/cards/${created.id}/move`, {
          targetColumnId: entry.snapshot.column_id,
          position: entry.snapshot.position,
        });
      }
    };
    entry.redo = async () => {
      const id = entry.restoredId || entry.snapshot.id;
      await API.delete(`/boards/${boardId}/cards/${id}`);
    };
    push(entry);
  }

  function recordColumnRename(boardId, colId, oldTitle, newTitle) {
    if (oldTitle === newTitle) return;
    push({
      scope: 'board',
      boardId,
      undo: () => API.put(`/boards/${boardId}/columns/${colId}`, { title: oldTitle }),
      redo: () => API.put(`/boards/${boardId}/columns/${colId}`, { title: newTitle }),
    });
  }

  function recordColumnAdd(boardId, colId, title) {
    const entry = { scope: 'board', boardId, colId, title };
    entry.undo = async () => {
      await API.delete(`/boards/${boardId}/columns/${entry.colId}`);
    };
    entry.redo = async () => {
      const created = await API.post(`/boards/${boardId}/columns`, { title: entry.title });
      entry.colId = created.id;
    };
    push(entry);
  }

  function recordColumnDelete(boardId, snapshot) {
    const entry = { scope: 'board', boardId, snapshot };
    entry.undo = async () => {
      const created = await API.post(`/boards/${boardId}/columns`, { title: entry.snapshot.title });
      entry.restoredColId = created.id;
      const cardIds = [];
      for (const card of entry.snapshot.cards || []) {
        const res = await API.post(`/boards/${boardId}/cards`, {
          columnId: created.id,
          title: card.title,
          description: card.description,
          assigneeId: card.assignee_id,
          dueDate: card.due_date ? String(card.due_date).substring(0, 10) : null,
          bgColor: card.bg_color,
          stripeColor: card.stripe_color || card.color,
        });
        cardIds.push({ oldId: card.id, newId: res.id, position: card.position });
      }
      for (const item of cardIds.sort((a, b) => a.position - b.position)) {
        if (item.position > 0) {
          await API.post(`/boards/${boardId}/cards/${item.newId}/move`, {
            targetColumnId: created.id,
            position: item.position,
          });
        }
      }
    };
    entry.redo = async () => {
      const colId = entry.restoredColId || entry.snapshot.id;
      await API.delete(`/boards/${boardId}/columns/${colId}`);
    };
    push(entry);
  }

  function recordColumnColorChange(boardId, colId, oldColor, newColor) {
    if ((oldColor || '') === (newColor || '')) return;
    push({
      scope: 'board',
      boardId,
      undo: () => API.put(`/boards/${boardId}/columns/${colId}`, { bg_color: oldColor || null }),
      redo: () => API.put(`/boards/${boardId}/columns/${colId}`, { bg_color: newColor || null }),
    });
  }

  function recordColumnMove(boardId, colId, fromPos, toPos) {
    if (fromPos === toPos) return;
    push({
      scope: 'board',
      boardId,
      undo: () => API.post(`/boards/${boardId}/columns/${colId}/move`, { position: fromPos }),
      redo: () => API.post(`/boards/${boardId}/columns/${colId}/move`, { position: toPos }),
    });
  }

  function recordBoardUpdate(boardId, before, after) {
    if (before.title === after.title && before.description === after.description && (before.bg_color||'') === (after.bg_color||'')) return;
    push({
      scope: 'boardList',
      boardId,
      undo: () => API.put(`/boards/${boardId}`, before),
      redo: () => API.put(`/boards/${boardId}`, after),
    });
  }

  return {
    setBoard,
    clear,
    canUndo,
    canRedo,
    isApplying,
    undo,
    redo,
    updateMenuState,
    recordCardMove,
    recordCardUpdate,
    recordCardCreate,
    recordCardDelete,
    recordColumnRename,
    recordColumnAdd,
    recordColumnDelete,
    recordColumnColorChange,
    recordColumnMove,
    recordBoardUpdate,
  };
})();
