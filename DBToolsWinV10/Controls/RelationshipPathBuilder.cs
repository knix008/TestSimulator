using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Controls;

public static class RelationshipPathBuilder
{
	private const int BezierSampleCount = 24;

	public static void EnsureRoutePoints(DbRelationship rel, PointF start, PointF end)
	{
		rel.RoutePoints ??= new List<RelationshipPoint>();
		if (rel.LineStyle == RelationshipLineStyle.Straight)
		{
			return;
		}
		if (rel.RoutePoints.Count > 0)
		{
			return;
		}
		if (rel.LineStyle == RelationshipLineStyle.Curved)
		{
			PointF control = GetDefaultCurveControl(start, end);
			rel.RoutePoints.Add(new RelationshipPoint(control.X, control.Y));
			return;
		}
		foreach (PointF bend in GetDefaultOrthogonalBends(start, end))
		{
			rel.RoutePoints.Add(new RelationshipPoint(bend.X, bend.Y));
		}
	}

	public static List<PointF> GetPathPoints(DbRelationship rel, PointF start, PointF end)
	{
		EnsureRoutePoints(rel, start, end);
		if (rel.LineStyle == RelationshipLineStyle.Straight)
		{
			return new List<PointF> { start, end };
		}
		if (rel.LineStyle == RelationshipLineStyle.Curved)
		{
			return SampleQuadraticBezier(start, GetCurveControl(rel, start, end), end);
		}
		List<PointF> list = new List<PointF> { start };
		foreach (RelationshipPoint routePoint in rel.RoutePoints)
		{
			list.Add(new PointF(routePoint.X, routePoint.Y));
		}
		list.Add(end);
		return list;
	}

	public static PointF GetCurveControl(DbRelationship rel, PointF start, PointF end)
	{
		if (rel.RoutePoints != null && rel.RoutePoints.Count > 0)
		{
			RelationshipPoint relationshipPoint = rel.RoutePoints[0];
			return new PointF(relationshipPoint.X, relationshipPoint.Y);
		}
		return GetDefaultCurveControl(start, end);
	}

	public static PointF GetPathMidpoint(DbRelationship rel, PointF start, PointF end)
	{
		List<PointF> pathPoints = GetPathPoints(rel, start, end);
		if (pathPoints.Count < 2)
		{
			return start;
		}
		if (rel.LineStyle == RelationshipLineStyle.Curved)
		{
			PointF curveControl = GetCurveControl(rel, start, end);
			return EvaluateQuadraticBezier(start, curveControl, end, 0.5f);
		}
		float num = 0f;
		for (int i = 0; i < pathPoints.Count - 1; i++)
		{
			num += Distance(pathPoints[i], pathPoints[i + 1]);
		}
		float num2 = num / 2f;
		float num3 = 0f;
		for (int j = 0; j < pathPoints.Count - 1; j++)
		{
			float num4 = Distance(pathPoints[j], pathPoints[j + 1]);
			if (num3 + num4 >= num2)
			{
				float amount = (num2 - num3) / Math.Max(num4, 0.001f);
				return Lerp(pathPoints[j], pathPoints[j + 1], amount);
			}
			num3 += num4;
		}
		return pathPoints[pathPoints.Count / 2];
	}

	public static bool HitTest(DbRelationship rel, PointF point, PointF start, PointF end, float tolerance)
	{
		List<PointF> pathPoints = GetPathPoints(rel, start, end);
		for (int i = 0; i < pathPoints.Count - 1; i++)
		{
			if (DistanceToSegment(point, pathPoints[i], pathPoints[i + 1]) < tolerance)
			{
				return true;
			}
		}
		return false;
	}

	public static int HitTestRoutePoint(DbRelationship rel, PointF point, PointF start, PointF end, float handleRadius)
	{
		if (rel.LineStyle == RelationshipLineStyle.Straight)
		{
			return -1;
		}
		EnsureRoutePoints(rel, start, end);
		for (int i = 0; i < rel.RoutePoints.Count; i++)
		{
			RelationshipPoint routePoint = rel.RoutePoints[i];
			if (Distance(point, new PointF(routePoint.X, routePoint.Y)) <= handleRadius)
			{
				return i;
			}
		}
		return -1;
	}

	public static void ResetRoutePoints(DbRelationship rel, PointF start, PointF end)
	{
		rel.RoutePoints ??= new List<RelationshipPoint>();
		rel.RoutePoints.Clear();
		EnsureRoutePoints(rel, start, end);
	}

	public static bool TryInsertOrthogonalBend(DbRelationship rel, PointF clickPoint, PointF start, PointF end, out int insertedIndex)
	{
		insertedIndex = -1;
		if (rel.LineStyle != RelationshipLineStyle.Orthogonal)
		{
			return false;
		}
		EnsureRoutePoints(rel, start, end);
		List<PointF> pathPoints = GetPathPoints(rel, start, end);
		float num = float.MaxValue;
		int num2 = -1;
		PointF pointF = clickPoint;
		for (int i = 0; i < pathPoints.Count - 1; i++)
		{
			PointF pointOnSegment = GetClosestPointOnSegment(clickPoint, pathPoints[i], pathPoints[i + 1], out float distance);
			if (distance < num)
			{
				num = distance;
				num2 = i;
				pointF = pointOnSegment;
			}
		}
		if (num2 < 0 || num > 18f)
		{
			return false;
		}
		int num3 = Math.Max(0, num2 - 1);
		rel.RoutePoints.Insert(num3, new RelationshipPoint(pointF.X, pointF.Y));
		insertedIndex = num3;
		return true;
	}

	private static IEnumerable<PointF> GetDefaultOrthogonalBends(PointF start, PointF end)
	{
		float num = (start.X + end.X) / 2f;
		yield return new PointF(num, start.Y);
		yield return new PointF(num, end.Y);
	}

	private static PointF GetDefaultCurveControl(PointF start, PointF end)
	{
		PointF pointF = Lerp(start, end, 0.5f);
		float num = end.X - start.X;
		float num2 = end.Y - start.Y;
		float num3 = MathF.Sqrt(num * num + num2 * num2);
		if (num3 < 1f)
		{
			return pointF;
		}
		float num4 = MathF.Min(80f, num3 * 0.2f);
		return new PointF(pointF.X - num2 / num3 * num4, pointF.Y + num / num3 * num4);
	}

	private static List<PointF> SampleQuadraticBezier(PointF start, PointF control, PointF end)
	{
		List<PointF> list = new List<PointF>(BezierSampleCount + 1);
		for (int i = 0; i <= BezierSampleCount; i++)
		{
			list.Add(EvaluateQuadraticBezier(start, control, end, i / (float)BezierSampleCount));
		}
		return list;
	}

	private static PointF EvaluateQuadraticBezier(PointF start, PointF control, PointF end, float t)
	{
		float num = 1f - t;
		float x = num * num * start.X + 2f * num * t * control.X + t * t * end.X;
		float y = num * num * start.Y + 2f * num * t * control.Y + t * t * end.Y;
		return new PointF(x, y);
	}

	private static PointF Lerp(PointF a, PointF b, float amount)
	{
		return new PointF(a.X + (b.X - a.X) * amount, a.Y + (b.Y - a.Y) * amount);
	}

	private static float Distance(PointF a, PointF b)
	{
		float num = a.X - b.X;
		float num2 = a.Y - b.Y;
		return MathF.Sqrt(num * num + num2 * num2);
	}

	private static float DistanceToSegment(PointF p, PointF a, PointF b)
	{
		GetClosestPointOnSegment(p, a, b, out float distance);
		return distance;
	}

	private static PointF GetClosestPointOnSegment(PointF p, PointF a, PointF b, out float distance)
	{
		float num = b.X - a.X;
		float num2 = b.Y - a.Y;
		float num3 = num * num + num2 * num2;
		if (num3 < 0.001f)
		{
			distance = Distance(p, a);
			return a;
		}
		float amount = Math.Clamp(((p.X - a.X) * num + (p.Y - a.Y) * num2) / num3, 0f, 1f);
		PointF pointF = Lerp(a, b, amount);
		distance = Distance(p, pointF);
		return pointF;
	}
}
