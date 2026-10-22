plugins { kotlin("jvm") version "1.9.0" }
val textVersion = "1.9"
dependencies {
    implementation("org.apache.commons:commons-text:$textVersion")
    api("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("io.mockk:mockk:1.13.8")
}
