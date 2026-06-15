using System;
using MyProject.Models;

var model = new ProjectModel { ProjectName = "Test" };
model.AddTask("Task 1");
var snap = ProjectFile.ToSnapshot(model, includeWindowSettings: false);
model.AddTask("Task 2");
Console.WriteLine($"Before undo tasks: {model.Tasks.Count}");
var restored = ProjectFile.FromSnapshot(snap, model.FilePath);
Console.WriteLine($"Restored tasks: {restored.Tasks.Count}");
Console.WriteLine($"Snapshot len: {snap.Length}");
