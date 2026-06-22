import "./globals.css";
import Providers from "./providers";
import Nav from "./components/Nav";

export const metadata = {
  title: "MyReqBoard - 요구사항/테스트케이스 관리",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          <Nav />
          <div className="container">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
