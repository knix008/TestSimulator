const password = "hunter2secret";
const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";
function run(input) {
  eval(input);
  if (input == password) {
    console.log(input);
    document.body.innerHTML = input;
  }
  setTimeout("doWork()", 10);
}
run(password);
