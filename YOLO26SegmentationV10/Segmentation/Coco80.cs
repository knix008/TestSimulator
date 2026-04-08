using System;
using System.Collections.Generic;

namespace YOLO26SegmentationV10.Segmentation
{
    internal static class Coco80
    {
        public static readonly string[] Names =
        {
            "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
            "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog",
            "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
            "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
            "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
            "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich",
            "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
            "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote",
            "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book",
            "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
        };

        public static bool TryParseClassFilter(string raw, out HashSet<int> allowedIds, out string error)
        {
            allowedIds = null;
            error = null;
            if (string.IsNullOrWhiteSpace(raw))
            {
                allowedIds = null;
                return true;
            }

            allowedIds = new HashSet<int>();
            var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < Names.Length; i++)
                map[Names[i]] = i;

            foreach (var part in raw.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var token = part.Trim();
                if (token.Length == 0)
                    continue;
                if (int.TryParse(token, out var id))
                {
                    if (id < 0 || id >= Names.Length)
                    {
                        error = $"클래스 ID는 0~{Names.Length - 1} 범위여야 합니다: {id}";
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
    }
}
