import java.security.MessageDigest;
class App {
  void query(java.sql.Statement stmt, String id) throws Exception {
    stmt.executeQuery("select * from users where id = " + id);
    System.out.println(id);
    MessageDigest.getInstance("MD5");
  }
}
