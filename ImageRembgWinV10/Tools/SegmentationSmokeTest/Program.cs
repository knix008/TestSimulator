using OpenCvSharp;
using CvPoint = OpenCvSharp.Point;
using ImageRembgWinV10.Services;

var bgr = new Mat(400, 600, MatType.CV_8UC3, new Scalar(100, 150, 200));
Cv2.Rectangle(bgr, new Rect(150, 80, 200, 250), new Scalar(50, 80, 120), -1);

var selection = new Mat(400, 600, MatType.CV_8UC1, Scalar.Black);
var pts = new List<CvPoint>();
for (var i = 0; i < 20000; i++)
{
    var angle = i * 0.05;
    pts.Add(new CvPoint(
        (int)(300 + 120 * Math.Cos(angle)),
        (int)(200 + 90 * Math.Sin(angle))));
}
Cv2.FillPoly(selection, [pts.ToArray()], Scalar.White);

Console.WriteLine("HasSelection pixels: " + Cv2.CountNonZero(selection));

foreach (var algorithm in Enum.GetValues<SegmentationAlgorithm>())
{
    try
    {
        using var result = SegmentationService.Segment(algorithm, bgr, selection, null, null);
        Console.WriteLine($"{algorithm}: OK ratio={result.ForegroundRatio:P1}");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"{algorithm}: ERROR {ex.GetType().Name}: {ex.Message}");
    }
}
