using System;
class Program {
  void Run(System.Data.IDbCommand cmd, string id) {
    cmd.ExecuteReader("select * from t where id = " + id);
  }
  async void Fire() { await System.Threading.Tasks.Task.Delay(1); }
}
