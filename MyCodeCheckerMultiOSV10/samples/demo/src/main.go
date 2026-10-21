package main
import "crypto/md5"
func query(db interface{ Query(string) }, id string) {
  db.Query("select * from t where id = " + id)
  md5.New()
}
