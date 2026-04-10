using System;
using System.Collections.Generic;
using System.Linq;

namespace YOLO26V10.yolo26
{
    internal static class ObbLabels
    {
        public const int DefaultClassCount = 15;

        public static string[] GetNames(int numClasses)
        {
            if (numClasses <= 0)
                return Array.Empty<string>();
            if (numClasses == ObbDota15.Names.Length)
                return ObbDota15.Names;
            if (numClasses == Coco80.Names.Length)
                return Coco80.Names;
            return Enumerable.Range(0, numClasses).Select(i => $"class{i}").ToArray();
        }

        public static bool TryParseClassFilter(string raw, int numClasses, out HashSet<int> allowedIds, out string error)
        {
            allowedIds = null;
            error = null;
            if (string.IsNullOrWhiteSpace(raw))
            {
                allowedIds = null;
                return true;
            }

            if (numClasses <= 0)
            {
                error = "유효하지 않은 클래스 수입니다.";
                return false;
            }

            var names = GetNames(numClasses);
            allowedIds = new HashSet<int>();
            var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < names.Length; i++)
                map[names[i]] = i;

            foreach (var part in raw.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var token = part.Trim();
                if (token.Length == 0)
                    continue;
                if (int.TryParse(token, out var id))
                {
                    if (id < 0 || id >= numClasses)
                    {
                        error = $"클래스 ID는 0~{numClasses - 1} 범위여야 합니다: {id}";
                        return false;
                    }

                    allowedIds.Add(id);
                    continue;
                }

                if (map.TryGetValue(token, out var cid))
                    allowedIds.Add(cid);
                else
                {
                    error = $"알 수 없는 클래스 이름: {token}";
                    return false;
                }
            }

            if (allowedIds.Count == 0)
            {
                error = "필터가 비어 있습니다.";
                return false;
            }

            return true;
        }

        public static string GetLabel(int classId, int numClasses)
        {
            var names = GetNames(numClasses);
            if (classId >= 0 && classId < names.Length)
                return names[classId];
            return $"c{classId}";
        }
    }
}
