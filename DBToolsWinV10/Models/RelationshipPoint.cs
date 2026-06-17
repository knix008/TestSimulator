namespace DBToolsWinV10.Models;

public class RelationshipPoint
{
	public float X { get; set; }

	public float Y { get; set; }

	public RelationshipPoint()
	{
	}

	public RelationshipPoint(float x, float y)
	{
		X = x;
		Y = y;
	}

	public RelationshipPoint Clone()
	{
		return new RelationshipPoint(X, Y);
	}
}
