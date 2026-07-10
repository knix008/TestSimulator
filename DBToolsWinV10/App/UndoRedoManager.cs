using System;
using System.Collections.Generic;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.App;

public sealed class UndoRedoManager
{
	private const int MaxDepth = 50;
	private readonly Stack<DbSchema> _undoStack = new();
	private readonly Stack<DbSchema> _redoStack = new();

	public event EventHandler StateChanged;

	public bool CanUndo => _undoStack.Count > 0;
	public bool CanRedo => _redoStack.Count > 0;

	public void Push(DbSchema snapshot)
	{
		_undoStack.Push(snapshot);
		if (_undoStack.Count > MaxDepth)
		{
			var arr = _undoStack.ToArray();
			_undoStack.Clear();
			for (int i = MaxDepth - 1; i >= 0; i--)
				_undoStack.Push(arr[i]);
		}
		_redoStack.Clear();
		StateChanged?.Invoke(this, EventArgs.Empty);
	}

	public DbSchema Undo(DbSchema current)
	{
		if (!CanUndo) return current;
		_redoStack.Push(current);
		var restored = _undoStack.Pop();
		StateChanged?.Invoke(this, EventArgs.Empty);
		return restored;
	}

	public DbSchema Redo(DbSchema current)
	{
		if (!CanRedo) return current;
		_undoStack.Push(current);
		var restored = _redoStack.Pop();
		StateChanged?.Invoke(this, EventArgs.Empty);
		return restored;
	}

	public void Clear()
	{
		_undoStack.Clear();
		_redoStack.Clear();
		StateChanged?.Invoke(this, EventArgs.Empty);
	}
}
