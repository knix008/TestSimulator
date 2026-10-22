module example.com/api

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	golang.org/x/net v0.10.0 // indirect
	github.com/dgrijalva/jwt-go v3.2.0+incompatible
)

require golang.org/x/text v0.3.7 // indirect

replace github.com/old/lib => github.com/new/lib v1.2.3
