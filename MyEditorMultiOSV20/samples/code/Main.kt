// Kotlin — data classes, extension functions, when
data class User(val name: String, val age: Int)

fun List<User>.adults() = filter { it.age >= 18 }

fun describe(u: User) = when {
    u.age < 13 -> "child"
    u.age < 20 -> "teen"
    else -> "adult"
}

fun main() {
    val users = listOf(User("Kim", 12), User("Lee", 17), User("Park", 40))
    users.adults().forEach { println("${it.name}: ${describe(it)}") }
}
