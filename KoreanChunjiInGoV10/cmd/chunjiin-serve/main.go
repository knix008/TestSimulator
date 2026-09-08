// chunjiin-serve - 웹 판을 띄우는 작은 서버.
//
// web/ 아래의 파일을 실행 파일 안에 품고 있으므로, 이 파일 하나만 있으면
// 어디서든 웹 판을 띄울 수 있다.
//
//	chunjiin-serve                      http://localhost:8080 에서 띄운다
//	chunjiin-serve -addr 127.0.0.1:9000  다른 자리에서 띄운다
//	chunjiin-serve -addr :8080           같은 망의 다른 기기에도 연다
//	chunjiin-serve -dir web              품고 있는 것 대신 그 폴더를 쓴다(개발용)
//
// .wasm 은 MIME 형식을 제대로 알려 주어야 브라우저가 스트리밍으로 받는다.
package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
)

//go:embed all:site
var site embed.FS

func main() {
	// 기본값은 이 컴퓨터에서만 열린다. 바깥에 열려면 -addr :8080 처럼
	// 주소를 비워 준다. 기본값을 :8080 으로 두면 Windows 방화벽이
	// 실행할 때마다 허용 여부를 묻는다.
	addr := flag.String("addr", "127.0.0.1:8080", "들을 자리")
	dir := flag.String("dir", "", "품고 있는 것 대신 쓸 폴더 (개발용)")
	flag.Parse()

	// 브라우저가 스트리밍으로 받도록 형식을 못박는다.
	_ = mime.AddExtensionType(".wasm", "application/wasm")

	var files http.FileSystem
	if *dir != "" {
		if _, err := os.Stat(*dir); err != nil {
			log.Fatalf("폴더를 찾지 못했습니다: %v", err)
		}
		files = http.Dir(*dir)
		log.Printf("폴더에서 띄웁니다: %s", *dir)
	} else {
		sub, err := fs.Sub(site, "site")
		if err != nil {
			log.Fatalf("품고 있는 파일을 열지 못했습니다: %v", err)
		}
		files = http.FS(sub)
	}

	http.Handle("/", noCache(http.FileServer(files)))

	log.Printf("천지인 한글 입력기 - %s", browseURL(*addr))
	log.Printf("멈추려면 Ctrl+C")
	log.Fatal(http.ListenAndServe(*addr, nil))
}

// noCache 는 브라우저가 옛 파일을 붙들고 있지 않게 한다.
// 고친 것이 바로 보이지 않으면 헷갈리기 때문이다.
func noCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// browseURL 은 들을 자리를 브라우저 주소창에 넣을 수 있는 꼴로 바꾼다.
//
//	127.0.0.1:8080  ->  http://localhost:8080
//	:8080           ->  http://localhost:8080
//	0.0.0.0:8080    ->  http://localhost:8080
func browseURL(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "http://" + addr
	}
	if host == "" || host == "0.0.0.0" || host == "127.0.0.1" || host == "::" {
		host = "localhost"
	}
	return "http://" + net.JoinHostPort(host, port)
}
