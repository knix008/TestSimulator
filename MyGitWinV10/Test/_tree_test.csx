using LibGit2Sharp;
using System;
var path = Repository.Discover(@"d:\Home\Projects\TestSimulator");
Console.WriteLine("Discover: " + path);
using var repo = new Repository(path);
Console.WriteLine("WorkingDir: " + repo.Info.WorkingDirectory);
Console.WriteLine("IsBare: " + repo.Info.IsBare);
Console.WriteLine("Head: " + repo.Head?.FriendlyName);
var wd = repo.Info.WorkingDirectory;
if (wd != null) {
  foreach (var d in System.IO.Directory.EnumerateDirectories(wd)) Console.WriteLine("DIR: " + System.IO.Path.GetFileName(d));
  foreach (var f in System.IO.Directory.EnumerateFiles(wd)) Console.WriteLine("FILE: " + System.IO.Path.GetFileName(f));
}
