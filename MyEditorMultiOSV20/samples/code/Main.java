// Java — generics, streams, records
import java.util.List;
import java.util.stream.Collectors;

public class Main {
    record Point(int x, int y) {
        double distance() { return Math.sqrt(x * x + y * y); }
    }

    public static void main(String[] args) {
        List<Point> points = List.of(new Point(3, 4), new Point(1, 1), new Point(6, 8));
        String far = points.stream()
            .filter(p -> p.distance() > 2)
            .map(Point::toString)
            .collect(Collectors.joining(", "));
        System.out.println("far points: " + far);
    }
}
