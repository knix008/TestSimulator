using System;
using System.Collections.Generic;
using System.IO;

namespace YOLO26V10.yolo26
{
    internal static class Imagenet1kLabels
    {
        private static string[] _names;
        private static readonly object Gate = new object();

        public static int Count
        {
            get
            {
                EnsureLoaded();
                return _names.Length;
            }
        }

        public static string GetName(int classId)
        {
            EnsureLoaded();
            if (classId >= 0 && classId < _names.Length)
                return _names[classId];
            return "#" + classId;
        }

        public static IReadOnlyList<string> AllNames
        {
            get
            {
                EnsureLoaded();
                return _names;
            }
        }

        private static void EnsureLoaded()
        {
            lock (Gate)
            {
                if (_names != null)
                    return;

                var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tools", "imagenet_classes.txt");
                if (File.Exists(path))
                {
                    var lines = File.ReadAllLines(path);
                    _names = lines.Length > 0 ? lines : CreateFallback();
                }
                else
                    _names = CreateFallback();
            }
        }

        private static string[] CreateFallback()
        {
            var a = new string[1000];
            for (var i = 0; i < a.Length; i++)
                a[i] = "class_" + i;
            return a;
        }
    }
}
