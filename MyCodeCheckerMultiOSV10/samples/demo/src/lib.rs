fn run(v: Option<i32>) {
  let _x = v.unwrap();
  unsafe { let _y = _x; }
}
