using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;

namespace MyMindWin.Controls
{
    internal static class ConnectionLineTaperHelper
    {
        private const double MinThicknessRatio = 0.20;
        private const double LevelDecay = 0.62;

        /// <summary>레벨이 깊을수록 가늘어지는 연결선 두께 (루트=가장 굵음).</summary>
        public static double ThicknessAtLevel(int level, double baseThickness)
        {
            if (baseThickness <= 0) return 1;
            double ratio = Math.Max(MinThicknessRatio, Math.Pow(LevelDecay, Math.Max(0, level)));
            return baseThickness * ratio;
        }

        /// <summary>중심선을 따라 부모→자식 방향으로 가늘어지는 채움 리본.</summary>
        public static PathGeometry BuildTaperedRibbon(
            Geometry centerLine,
            double startWidth,
            double endWidth,
            int samples = 36)
        {
            var points = ExtractPolyline(centerLine);
            if (points.Count < 2)
                return new PathGeometry();

            var resampled = ResampleUniform(points, Math.Max(8, samples));
            return BuildRibbon(resampled, startWidth, endWidth);
        }

        private static List<Point> ExtractPolyline(Geometry geometry)
        {
            // IsFilled=false 인 연결선은 채움 영역이 없어 GetFlattenedPathGeometry()가 빈 결과를
            // 반환합니다. PathFigure를 직접 따라 샘플링해야 테이퍼 리본이 그려집니다.
            if (geometry is PathGeometry pathGeometry && pathGeometry.Figures.Count > 0)
            {
                var fromSource = ExtractFromFigures(pathGeometry.Figures);
                if (fromSource.Count >= 2)
                    return fromSource;
            }

            var flat = geometry.GetFlattenedPathGeometry(0.35, ToleranceType.Absolute);
            var fromFlat = ExtractFromFigures(flat.Figures);
            return fromFlat.Count >= 2 ? fromFlat : [];
        }

        private static List<Point> ExtractFromFigures(PathFigureCollection figures)
        {
            var result = new List<Point>();

            foreach (PathFigure figure in figures)
            {
                if (result.Count == 0 ||
                    Distance(result[^1], figure.StartPoint) > 0.01)
                    result.Add(figure.StartPoint);

                foreach (PathSegment segment in figure.Segments)
                {
                    switch (segment)
                    {
                        case LineSegment line:
                            result.Add(line.Point);
                            break;
                        case PolyLineSegment poly:
                            result.AddRange(poly.Points);
                            break;
                        case BezierSegment bezier:
                            SampleCubic(result, result[^1], bezier.Point1, bezier.Point2, bezier.Point3, 12);
                            break;
                        case QuadraticBezierSegment quad:
                            SampleQuadratic(result, result[^1], quad.Point1, quad.Point2, 8);
                            break;
                        case PolyBezierSegment polyBezier:
                            AppendPolyBezier(result, polyBezier);
                            break;
                        case ArcSegment arc:
                            SampleArc(result, result[^1], arc, 10);
                            break;
                    }
                }
            }

            return result;
        }

        private static void AppendPolyBezier(List<Point> output, PolyBezierSegment polyBezier)
        {
            var points = polyBezier.Points;
            if (points.Count < 3)
                return;

            int i = 0;
            var p0 = output[^1];
            while (i + 2 < points.Count)
            {
                SampleCubic(output, p0, points[i], points[i + 1], points[i + 2], 10);
                p0 = points[i + 2];
                i += 3;
            }
        }

        private static void SampleArc(List<Point> output, Point start, ArcSegment arc, int steps)
        {
            var figure = new PathFigure { StartPoint = start, IsFilled = false };
            figure.Segments.Add(arc);
            var geom = new PathGeometry();
            geom.Figures.Add(figure);
            var flat = geom.GetFlattenedPathGeometry(0.25, ToleranceType.Absolute);
            foreach (PathFigure f in flat.Figures)
            {
                if (output.Count == 0 || Distance(output[^1], f.StartPoint) > 0.01)
                    output.Add(f.StartPoint);
                foreach (PathSegment seg in f.Segments)
                {
                    if (seg is LineSegment line)
                        output.Add(line.Point);
                    else if (seg is PolyLineSegment poly)
                        output.AddRange(poly.Points);
                }
            }
        }

        private static void SampleCubic(
            List<Point> output, Point p0, Point p1, Point p2, Point p3, int steps)
        {
            for (int i = 1; i <= steps; i++)
            {
                double t = i / (double)steps;
                double u = 1 - t;
                output.Add(new Point(
                    u * u * u * p0.X + 3 * u * u * t * p1.X + 3 * u * t * t * p2.X + t * t * t * p3.X,
                    u * u * u * p0.Y + 3 * u * u * t * p1.Y + 3 * u * t * t * p2.Y + t * t * t * p3.Y));
            }
        }

        private static void SampleQuadratic(
            List<Point> output, Point p0, Point p1, Point p2, int steps)
        {
            for (int i = 1; i <= steps; i++)
            {
                double t = i / (double)steps;
                double u = 1 - t;
                output.Add(new Point(
                    u * u * p0.X + 2 * u * t * p1.X + t * t * p2.X,
                    u * u * p0.Y + 2 * u * t * p1.Y + t * t * p2.Y));
            }
        }

        private static List<Point> ResampleUniform(List<Point> points, int count)
        {
            if (points.Count <= count)
                return new List<Point>(points);

            var lengths = new double[points.Count - 1];
            double total = 0;
            for (int i = 0; i < lengths.Length; i++)
            {
                lengths[i] = Distance(points[i], points[i + 1]);
                total += lengths[i];
            }

            if (total < 0.01)
                return [points[0], points[^1]];

            var result = new List<Point>(count) { points[0] };
            double step = total / (count - 1);
            int seg = 0;
            double segStart = 0;

            for (int i = 1; i < count - 1; i++)
            {
                double target = i * step;
                while (seg < lengths.Length && segStart + lengths[seg] < target)
                {
                    segStart += lengths[seg];
                    seg++;
                }

                if (seg >= lengths.Length)
                {
                    result.Add(points[^1]);
                    break;
                }

                double local = lengths[seg] > 0.001 ? (target - segStart) / lengths[seg] : 0;
                result.Add(Lerp(points[seg], points[seg + 1], local));
            }

            result.Add(points[^1]);
            return result;
        }

        private static PathGeometry BuildRibbon(List<Point> center, double startWidth, double endWidth)
        {
            int n = center.Count;
            var left = new Point[n];
            var right = new Point[n];

            for (int i = 0; i < n; i++)
            {
                double t = n > 1 ? i / (double)(n - 1) : 0;
                double half = (startWidth * (1 - t) + endWidth * t) / 2;
                var tangent = GetTangent(center, i);
                var normal = new Vector(-tangent.Y, tangent.X);
                if (normal.Length > 0.001)
                    normal.Normalize();
                else
                    normal = new Vector(0, 1);

                left[i] = center[i] + normal * half;
                right[i] = center[i] - normal * half;
            }

            var figure = new PathFigure { StartPoint = left[0], IsClosed = true, IsFilled = true };
            for (int i = 1; i < n; i++)
                figure.Segments.Add(new LineSegment(left[i], true));

            for (int i = n - 1; i >= 0; i--)
                figure.Segments.Add(new LineSegment(right[i], true));

            var geometry = new PathGeometry { FillRule = FillRule.Nonzero };
            geometry.Figures.Add(figure);
            return geometry;
        }

        private static Vector GetTangent(List<Point> points, int index)
        {
            if (points.Count < 2)
                return new Vector(1, 0);

            if (index <= 0)
                return ToVector(points[0], points[1]);

            if (index >= points.Count - 1)
                return ToVector(points[^2], points[^1]);

            var a = ToVector(points[index - 1], points[index]);
            var b = ToVector(points[index], points[index + 1]);
            return a + b;
        }

        private static Vector ToVector(Point from, Point to) => new(to.X - from.X, to.Y - from.Y);

        private static Point Lerp(Point a, Point b, double t) =>
            new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);

        private static double Distance(Point a, Point b)
        {
            double dx = a.X - b.X;
            double dy = a.Y - b.Y;
            return Math.Sqrt(dx * dx + dy * dy);
        }
    }
}
